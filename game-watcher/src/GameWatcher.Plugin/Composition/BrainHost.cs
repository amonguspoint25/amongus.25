using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Http;

namespace GameWatcher.Plugin;

// Composition root + background worker. Builds the network seam, RankedGate (host-key validity poll)
// and LinkManager (roster resolution). All HTTP runs on background threads; the main thread (chat,
// HUD, start gate) only reads volatile snapshots — nothing here touches an Il2Cpp game object.
public sealed class BrainHost
{
    private readonly RankedGate _gate;
    private readonly LinkManager _link;
    private readonly CancellationTokenSource _cts = new();
    private volatile int _lastStatus = (int)RankedStatus.Unknown;
    private volatile bool _polledOnce;

    // Pre-start link gate verdict (read on the main thread by StartGate).
    private volatile int _verdict;            // 0 pending, 1 ready (all linked), 2 blocked
    private volatile string _blockedNames = "";
    private int _resolving;                    // Interlocked guard: one roster resolve at a time

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
    }

    public void Start()
    {
        if (HasKey) _ = Task.Run(PollLoopAsync);
    }

    public void Stop() => _cts.Cancel();

    private async Task PollLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            try { _lastStatus = (int)await _gate.GetStatusAsync(_cts.Token).ConfigureAwait(false); _polledOnce = true; }
            catch { /* a poll failure must never bubble into the game */ }
            try { await Task.Delay(TimeSpan.FromSeconds(5), _cts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
        }
    }

    // Resolve a lobby roster (plain records snapshotted on the main thread) against /api/lobby/roster
    // on a background thread, caching a verdict + the unlinked players' names for the start gate.
    public void CheckRoster(IReadOnlyList<RosterPlayer> players, IReadOnlyDictionary<int, string> names)
    {
        if (Interlocked.CompareExchange(ref _resolving, 1, 0) != 0) return; // one at a time
        _ = Task.Run(async () =>
        {
            try
            {
                var unmatched = await _link.ResolveRosterAsync(players, _cts.Token).ConfigureAwait(false);
                if (unmatched == null || unmatched.Count == 0)
                {
                    _blockedNames = "";
                    _verdict = 1;
                }
                else
                {
                    var nm = new List<string>();
                    foreach (var id in unmatched)
                        nm.Add(names != null && names.TryGetValue(id, out var n) && !string.IsNullOrEmpty(n) ? n : ("#" + id));
                    _blockedNames = string.Join(", ", nm);
                    _verdict = 2;
                }
                GameWatcherPlugin.Logger?.LogInfo($"[gate] roster resolved: verdict={_verdict} blocked='{_blockedNames}'");
            }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[gate] roster check failed: " + e.Message); }
            finally { Interlocked.Exchange(ref _resolving, 0); }
        });
    }
}
