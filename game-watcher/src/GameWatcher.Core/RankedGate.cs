using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core.Http;

namespace GameWatcher.Core
{
    public enum RankedStatus
    {
        Enabled,   // 200 {valid:true} — valid, non-revoked host key
        Disabled,  // 401 — missing/fake/revoked key: authoritatively NOT ranked
        Unknown,   // network/5xx/timeout — site blip; can't tell, don't silently drop the game
    }

    // Replaces the spec's stale "ArmState poll". The website removed all arm/disarm machinery
    // (commit d43a072): GET /api/host/status is now a one-shot key validator. The model is binary —
    // a valid, non-revoked key => ranked is ON — but we report THREE states so a transient outage at
    // GameStarted isn't mistaken for "off" (which would silently drop a whole ranked game; spec §6).
    public sealed class RankedGate
    {
        private const string StatusPath = "/api/host/status";
        private readonly IHttpTransport _transport;

        public RankedGate(IHttpTransport transport) => _transport = transport;

        public async Task<RankedStatus> GetStatusAsync(CancellationToken ct = default)
        {
            var resp = await _transport.SendAsync(new HttpRequestSpec(HttpMethod.Get, StatusPath), ct)
                .ConfigureAwait(false);
            return resp.StatusCode switch
            {
                200 => RankedStatus.Enabled,
                401 => RankedStatus.Disabled,
                _ => RankedStatus.Unknown, // 0 (network) / 5xx / timeout
            };
        }
    }
}
