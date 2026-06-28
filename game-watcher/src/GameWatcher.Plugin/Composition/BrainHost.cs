using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Http;
using GameWatcher.Core.Queue;

namespace GameWatcher.Plugin;

// Composition root + background worker. Builds the full Core chain (gate, link, recorder, builder,
// sender, session). Game events are enqueued on the main thread and drained by a background worker
// that awaits MatchSession.HandleAsync — so HTTP never blocks a frame, and nothing here touches an
// Il2Cpp game object off-thread (only plain records + HttpClient). The main thread reads volatile
// snapshots / drains pending chat lines.
public sealed class BrainHost
{
    private readonly RankedGate _gate;
    private readonly LinkManager _link;
    private readonly MatchSession _session;
    private readonly CancellationTokenSource _cts = new();
    private readonly ConcurrentQueue<GameEvent> _events = new();

    private volatile int _lastStatus = (int)RankedStatus.Unknown;
    private volatile bool _polledOnce;

    private volatile int _verdict;            // 0 pending, 1 ready, 2 blocked
    private volatile string _blockedNames = "";
    private int _resolving;

    private readonly string _linkUrl;
    private volatile string _pendingAnnounce;  // "not linked" notice
    private readonly ConcurrentQueue<string> _pendingChat = new();  // batched post-match chat lines
    private string _lastAnnouncedBlocked = " ";

    public bool HasKey { get; }
    public bool PolledOnce => _polledOnce;
    public RankedStatus LastStatus => (RankedStatus)_lastStatus;
    public bool RankedActive => RankedState.Enabled && HasKey && LastStatus != RankedStatus.Disabled;
    public int Verdict => _verdict;
    public string BlockedNames => _blockedNames;

    public BrainHost(PluginConfig cfg)
    {
        HasKey = !string.IsNullOrWhiteSpace(cfg.HostKey.Value);
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
        var transport = new HttpClientTransport(http, cfg.WebsiteBaseUrl.Value, cfg.HostKey.Value ?? string.Empty);
        _gate = new RankedGate(transport);
        _link = new LinkManager(transport);
        var sender = new Sender(transport, new InMemoryMatchQueue());
        _session = new MatchSession(_gate, _link, new MatchRecorder(), new MatchBuilder(), sender);
        _linkUrl = (cfg.WebsiteBaseUrl.Value ?? "").Replace("https://", "").Replace("http://", "").TrimEnd('/') + "/link";
    }

    public void Start()
    {
        if (!HasKey) return;
        _ = Task.Run(PollLoopAsync);
        _ = Task.Run(EventLoopAsync);
    }

    public void Stop() => _cts.Cancel();

    // Called on the main thread (injector now, real reader later) with plain event records.
    public void Enqueue(GameEvent e) => _events.Enqueue(e);

    // True once the roster resolve has cached this in-game player's account (used to script roles).
    public bool IsLinked(string inGameId) => _link.TryGetPlayerId(inGameId, out _);

    // Drained by the main thread each frame -> RpcSendChat (chat must be sent main-thread).
    public string TakePendingAnnounce() => Interlocked.Exchange(ref _pendingAnnounce, null);
    // One queued chat line per call (the caller throttles the cadence to avoid AU's chat-spam kick).
    public string TakeChatLine() => _pendingChat.TryDequeue(out var s) ? s : null;

    private async Task PollLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            try { _lastStatus = (int)await _gate.GetStatusAsync(_cts.Token).ConfigureAwait(false); _polledOnce = true; }
            catch { }
            try { await Task.Delay(TimeSpan.FromSeconds(5), _cts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task EventLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            if (_events.TryDequeue(out var e))
            {
                try { OnOutcome(await _session.HandleAsync(e, _cts.Token).ConfigureAwait(false)); }
                catch (Exception ex) { GameWatcherPlugin.Logger?.LogWarning("[match] handle failed: " + ex.Message); }
            }
            else
            {
                try { await Task.Delay(40, _cts.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    private void OnOutcome(SessionOutcome o)
    {
        if (o.Kind == SessionResultKind.Sent)
        {
            var st = o.Send != null ? o.Send.Status : SendStatus.Queued;
            if (st == SendStatus.Sent)
            {
                var lines = PackDeltas(o.Send?.Deltas);
                _pendingChat.Enqueue(lines.Count > 0 ? "Match recorded! ELO:" : "Match recorded on the leaderboard!");
                foreach (var line in lines) _pendingChat.Enqueue(line);
            }
            else
            {
                _pendingChat.Enqueue(
                    st == SendStatus.Queued ? "Match queued (site down) - will retry" :
                    st == SendStatus.Unauthorized ? "Match failed - host key invalid" :
                    "Match rejected by the server");
            }
        }
        else if (o.Kind == SessionResultKind.Refused)
        {
            _pendingChat.Enqueue(Trunc("Match NOT sent: " + (o.Warning ?? "refused"), 95));
        }
        if (o.Kind != SessionResultKind.None)
            GameWatcherPlugin.Logger?.LogInfo("[match] outcome=" + o.Kind + (o.Warning != null ? " warning=" + o.Warning : ""));
    }

    // Pack per-player deltas into <=90-char chat lines, e.g. "Alice +15  Bob -12  Carol +8".
    private static List<string> PackDeltas(IReadOnlyList<EloDelta> deltas)
    {
        var lines = new List<string>();
        if (deltas == null || deltas.Count == 0) return lines;
        var cur = "";
        foreach (var d in deltas)
        {
            var part = $"{Short(d.Name, 10)} {(d.Value >= 0 ? "+" : "")}{(int)Math.Round(d.Value)}";
            if (cur.Length > 0 && cur.Length + part.Length + 2 > 90) { lines.Add(cur); cur = ""; }
            cur = cur.Length == 0 ? part : cur + "  " + part;
        }
        if (cur.Length > 0) lines.Add(cur);
        return lines;
    }

    private static string Short(string s, int n) => string.IsNullOrEmpty(s) ? "?" : (s.Length <= n ? s : s.Substring(0, n));

    // Resolve a lobby roster against /api/lobby/roster on a background thread, caching a verdict for
    // the start gate + raising a one-time chat notice (with the /link URL) when the unlinked set changes.
    public void CheckRoster(IReadOnlyList<RosterPlayer> players, IReadOnlyDictionary<int, string> names)
    {
        if (Interlocked.CompareExchange(ref _resolving, 1, 0) != 0) return;
        _ = Task.Run(async () =>
        {
            try
            {
                var unmatched = await _link.ResolveRosterAsync(players, _cts.Token).ConfigureAwait(false);
                if (unmatched == null || unmatched.Count == 0)
                {
                    _blockedNames = "";
                    _verdict = 1;
                    _lastAnnouncedBlocked = " ";
                }
                else
                {
                    var nm = new List<string>();
                    foreach (var id in unmatched)
                        nm.Add(names != null && names.TryGetValue(id, out var n) && !string.IsNullOrEmpty(n) ? n : ("#" + id));
                    _blockedNames = string.Join(", ", nm);
                    _verdict = 2;
                    if (_blockedNames != _lastAnnouncedBlocked)
                    {
                        _lastAnnouncedBlocked = _blockedNames;
                        _pendingAnnounce = Trunc("Not linked: " + _blockedNames + " - link at " + _linkUrl, 95);
                    }
                }
                GameWatcherPlugin.Logger?.LogInfo($"[gate] roster resolved: verdict={_verdict} blocked='{_blockedNames}'");
            }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[gate] roster check failed: " + e.Message); }
            finally { Interlocked.Exchange(ref _resolving, 0); }
        });
    }

    // Stay under Among Us's ~100-char chat limit (over-length chat = server kick).
    private static string Trunc(string s, int n) => s.Length <= n ? s : s.Substring(0, n - 2) + "..";
}
