using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Http;
using GameWatcher.Core.Json;
using GameWatcher.Core.Queue;

namespace GameWatcher.Core
{
    public enum SendStatus
    {
        Sent,               // 200 — accepted (or idempotent re-accept)
        Queued,             // transient (network/5xx/429) — held for retry
        RejectedPermanent,  // 400 — schema-invalid body; retrying can never help
        Unauthorized,       // 401 — host key bad/revoked
    }

    public sealed record SendResult(SendStatus Status, int HttpStatus, string? Detail = null);

    public sealed record DrainResult(int Sent, int Dropped, bool StoppedUnauthorized, int Remaining);

    // POSTs matches to /api/ingest/match; on transient failure (or a live 401), parks them in the
    // queue and retries on DrainAsync. matchCode is unique and the server is idempotent, so re-sends
    // are safe no-ops. ponytail: backoff = the caller's drain cadence (a timer in the plugin) — no
    // internal sleep loop, which keeps this fully testable with a fake transport.
    public sealed class Sender
    {
        private const string IngestPath = "/api/ingest/match";

        private readonly IHttpTransport _transport;
        private readonly IMatchQueue _queue;

        public Sender(IHttpTransport transport, IMatchQueue queue)
        {
            _transport = transport;
            _queue = queue;
        }

        public async Task<SendResult> SendAsync(MatchPayload payload, CancellationToken ct = default)
        {
            SendResult result;
            try
            {
                result = await AttemptAsync(payload, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // App shutdown mid-POST — persist so next session's DrainAsync retries (spec §6).
                _queue.Enqueue(payload);
                throw;
            }

            // Park transient failures AND a live 401 (key revoked mid-session) for retry/re-auth,
            // consistent with DrainAsync. Only a 400 (schema-invalid) is dropped — retrying can't help.
            if (result.Status == SendStatus.Queued || result.Status == SendStatus.Unauthorized)
                _queue.Enqueue(payload);

            return result;
        }

        // Retry every queued match. Call on a timer or on reconnect.
        public async Task<DrainResult> DrainAsync(CancellationToken ct = default)
        {
            int sent = 0, dropped = 0;
            var stoppedUnauthorized = false;

            foreach (var payload in _queue.Snapshot())
            {
                ct.ThrowIfCancellationRequested();
                var r = await AttemptAsync(payload, ct).ConfigureAwait(false);

                if (r.Status == SendStatus.Sent)
                {
                    _queue.Remove(payload.MatchCode);
                    sent++;
                }
                else if (r.Status == SendStatus.RejectedPermanent)
                {
                    // Server will NEVER accept this body — re-queuing loops forever. Drop + count.
                    _queue.Remove(payload.MatchCode);
                    dropped++;
                }
                else if (r.Status == SendStatus.Unauthorized)
                {
                    // Bad/revoked key: every remaining item will 401 too. Stop; keep the queue for re-auth.
                    stoppedUnauthorized = true;
                    break;
                }
                // else Queued (transient): leave it queued and CONTINUE, so one slow/stuck match can't
                // block newer ones (no head-of-line stall). ponytail: no per-item attempt cap yet — add
                // a dead-letter/max-attempts counter if a single record ever 5xxes forever.
            }

            return new DrainResult(sent, dropped, stoppedUnauthorized, _queue.Count);
        }

        private async Task<SendResult> AttemptAsync(MatchPayload payload, CancellationToken ct)
        {
            var body = GameWatcherJson.Serialize(payload);
            var resp = await _transport.SendAsync(new HttpRequestSpec(HttpMethod.Post, IngestPath, body), ct)
                .ConfigureAwait(false);

            return resp.StatusCode switch
            {
                200 => new SendResult(SendStatus.Sent, 200),
                400 => new SendResult(SendStatus.RejectedPermanent, 400, resp.Body),
                401 => new SendResult(SendStatus.Unauthorized, 401, resp.Body),
                _ => new SendResult(SendStatus.Queued, resp.StatusCode, resp.Body), // 0/5xx/429/unknown => transient
            };
        }
    }
}
