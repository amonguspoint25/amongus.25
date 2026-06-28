using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Http;

namespace GameWatcher.Plugin;

// Composition root + background worker. This increment builds the network seam + RankedGate and
// polls the site for host-key validity on a BACKGROUND thread, exposing the latest result as a
// volatile the main thread (chat / HUD) reads. Reads need no marshaling; nothing here ever touches
// an Il2Cpp game object off the main thread (only HttpClient + an enum), so it's crash-safe.
public sealed class BrainHost
{
    private readonly RankedGate _gate;
    private readonly CancellationTokenSource _cts = new();
    private volatile int _lastStatus = (int)RankedStatus.Unknown;
    private volatile bool _polledOnce;

    public bool HasKey { get; }
    public bool PolledOnce => _polledOnce;
    public RankedStatus LastStatus => (RankedStatus)_lastStatus;

    public BrainHost(PluginConfig cfg)
    {
        HasKey = !string.IsNullOrWhiteSpace(cfg.HostKey.Value);
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
        var transport = new HttpClientTransport(http, cfg.WebsiteBaseUrl.Value, cfg.HostKey.Value ?? string.Empty);
        _gate = new RankedGate(transport);
    }

    public void Start()
    {
        if (HasKey) _ = Task.Run(PollLoopAsync); // dormant without a key
    }

    public void Stop() => _cts.Cancel();

    private async Task PollLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                _lastStatus = (int)await _gate.GetStatusAsync(_cts.Token).ConfigureAwait(false);
                _polledOnce = true;
            }
            catch { /* a poll failure must never bubble into the game */ }

            try { await Task.Delay(TimeSpan.FromSeconds(5), _cts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
        }
    }
}
