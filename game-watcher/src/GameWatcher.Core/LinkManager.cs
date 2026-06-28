using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Http;
using GameWatcher.Core.Json;

namespace GameWatcher.Core
{
    // Watches lobby chat for one-time link codes, redeems them via POST /api/link, and
    // caches inGameId -> OPAQUE playerId for the session. Keys on playerId, NOT discordId
    // (commit ef5b8ee: Discord ids never leave the server; the 200 response is
    // {ok, playerId, displayName}).
    public sealed class LinkManager
    {
        private const string LinkPath = "/api/link";

        // Built from the website's literal genCode alphabet (linkcode.ts):
        // ABCDEFGHJKMNPQRSTUVWXYZ23456789 — omits I, L, O, 0, 1. Using the literal set
        // (not char ranges) so an off-by-one range can't silently admit L or O.
        private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

        private static readonly Regex ChatScan =
            new Regex(@"\b[" + Alphabet + @"]{8}\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex ExactCode =
            new Regex(@"^[" + Alphabet + @"]{8}$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private readonly IHttpTransport _transport;
        private readonly Dictionary<string, string> _byInGameId = new();

        public LinkManager(IHttpTransport transport) => _transport = transport;

        public IReadOnlyDictionary<string, string> LinkMap => _byInGameId;

        public bool TryGetPlayerId(string inGameId, out string playerId)
            => _byInGameId.TryGetValue(inGameId, out playerId!);

        // Pulls the first valid-looking code out of a chat line and upper-cases it.
        public static bool TryExtractCode(string text, out string code)
        {
            var m = ChatScan.Match(text ?? string.Empty);
            code = m.Success ? m.Value.ToUpperInvariant() : string.Empty;
            return m.Success;
        }

        // Convenience: scan one chat message; redeem if it carries a code.
        public Task<bool> HandleChatAsync(ChatMessage msg, CancellationToken ct = default)
        {
            return TryExtractCode(msg.Text, out var code)
                ? RedeemAsync(msg.SenderInGameId, code, ct)
                : Task.FromResult(false);
        }

        // Redeems a code for an in-game player. Validates the format LOCALLY first — the
        // server does NOT length/charset-check linkCode, so a malformed scrape would just
        // 404 and burn the user's attempt. On 200 we cache inGameId -> playerId.
        public async Task<bool> RedeemAsync(string inGameId, string code, CancellationToken ct = default)
        {
            if (code == null || !ExactCode.IsMatch(code)) return false;
            var normalized = code.ToUpperInvariant();

            var body = GameWatcherJson.Serialize(new LinkRequest(normalized));
            var resp = await _transport.SendAsync(new HttpRequestSpec(HttpMethod.Post, LinkPath, body), ct)
                .ConfigureAwait(false);

            if (resp.StatusCode != 200) return false; // 404 invalid/expired/used; 401 bad key; etc.

            // Keep the network seam exception-free (IHttpTransport contract): a malformed/empty 200
            // body (proxy/CDN edge) is a failed redemption, not a crash on the chat hot path.
            LinkResponse? parsed;
            try
            {
                parsed = GameWatcherJson.Deserialize<LinkResponse>(resp.Body);
            }
            catch (JsonException)
            {
                return false;
            }
            if (parsed == null || !parsed.Ok || string.IsNullOrEmpty(parsed.PlayerId)) return false;

            _byInGameId[inGameId] = parsed.PlayerId!;
            return true;
        }

        private sealed record LinkRequest(string LinkCode);

        private sealed record LinkResponse(bool Ok, string? PlayerId, string? DisplayName);

        private const string RosterPath = "/api/lobby/roster";

        // Bulk-resolve a whole lobby by friend code (spec §9 gate). Populates inGameId -> playerId
        // for every matched player and returns the inGameIds we could NOT resolve. On any non-200
        // (bad key, site down) or malformed body, nothing is cached and EVERY player is reported
        // unmatched, so the caller fails safe: a lobby it can't verify is treated as "not all linked".
        public async Task<IReadOnlyList<int>> ResolveRosterAsync(
            IReadOnlyList<RosterPlayer> players, CancellationToken ct = default)
        {
            if (players == null || players.Count == 0) return System.Array.Empty<int>();

            var body = GameWatcherJson.Serialize(new RosterRequest(players));
            var resp = await _transport.SendAsync(new HttpRequestSpec(HttpMethod.Post, RosterPath, body), ct)
                .ConfigureAwait(false);

            if (resp.StatusCode != 200) return players.Select(p => p.InGameId).ToList();

            RosterResponse? parsed;
            try { parsed = GameWatcherJson.Deserialize<RosterResponse>(resp.Body); }
            catch (JsonException) { return players.Select(p => p.InGameId).ToList(); }
            if (parsed == null) return players.Select(p => p.InGameId).ToList();

            foreach (var m in parsed.Matched ?? new System.Collections.Generic.List<RosterMatch>())
                if (!string.IsNullOrEmpty(m.PlayerId))
                    _byInGameId[m.InGameId.ToString(CultureInfo.InvariantCulture)] = m.PlayerId!;

            return parsed.Unmatched ?? new System.Collections.Generic.List<int>();
        }

        private sealed record RosterRequest(IReadOnlyList<RosterPlayer> Players);
        private sealed record RosterMatch(int InGameId, string? PlayerId, string? DisplayName);
        private sealed record RosterResponse(
            IReadOnlyList<RosterMatch>? Matched,
            IReadOnlyList<int>? Unmatched);
    }

    // Lobby roster row the host reads from the game and sends to /api/lobby/roster (spec §9).
    public sealed record RosterPlayer(int InGameId, string FriendCode, string? Puid = null, string? InGameName = null);
}
