using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core
{
    public sealed record MatchBuildResult(bool Ok, MatchPayload? Payload, string? Warning)
    {
        public static MatchBuildResult Built(MatchPayload p) => new(true, p, null);
        public static MatchBuildResult Refused(string warning) => new(false, null, warning);
    }

    // Turns a RecordedMatch + the session link map into the exact MatchPayload — or refuses
    // to send when the server would be guaranteed to reject (spec §5.4 guard).
    public sealed class MatchBuilder
    {
        public MatchBuildResult Build(RecordedMatch match, IReadOnlyDictionary<string, string> linkMap)
        {
            if (match.Outcome == null || match.EndedAt == null)
                return MatchBuildResult.Refused("Game has not ended (no outcome recorded); not sending.");

            var outcome = match.Outcome.Value;
            var participants = new List<Participant>();
            var dropped = 0;

            foreach (var p in match.Players)
            {
                // Drop unlinked players — the server only counts linked players, and a
                // playerId is the only identity that resolves on its side.
                if (!linkMap.TryGetValue(p.InGameId, out var playerId) || string.IsNullOrEmpty(playerId))
                {
                    dropped++;
                    continue;
                }

                // DERIVE won from role+outcome — never track it independently. The server's
                // superRefine rejects any inconsistency, so deriving makes a class of 400s impossible.
                var won = p.Role == Role.IMPOSTOR ? outcome == Outcome.IMP_WIN : outcome == Outcome.CREW_WIN;

                participants.Add(new Participant(
                    PlayerId: playerId,
                    Role: p.Role,
                    Won: won,
                    Kills: p.Kills,
                    CorrectShots: p.CorrectShots,
                    IncorrectShots: p.IncorrectShots,
                    TasksDone: p.TasksDone,
                    TasksTotal: p.TasksTotal,
                    Survived: p.Survived,
                    RoundsSurvived: p.RoundsSurvived,
                    TimeToKillMs: p.TimeToKillMs,
                    TimeToTaskMs: p.TimeToTaskMs));
            }

            // Server requires >=1 IMPOSTOR and >=1 CREW. Pre-check AFTER dropping unlinked
            // players so we never fire a doomed POST — warn the host to get everyone linked.
            var hasImp = participants.Any(p => p.Role == Role.IMPOSTOR);
            var hasCrew = participants.Any(p => p.Role == Role.CREW);
            if (!hasImp || !hasCrew)
            {
                return MatchBuildResult.Refused(
                    $"Not everyone linked: after dropping {dropped} unlinked player(s), the match is missing a " +
                    $"whole role (impostor: {(hasImp ? "ok" : "MISSING")}, crew: {(hasCrew ? "ok" : "MISSING")}). " +
                    "Match not sent — have everyone link before the next ranked game.");
            }

            // Server rejects duplicate playerIds (400 -> permanent drop). Two in-game slots can resolve
            // to one account (a player regenerating link codes), so pre-check uniqueness rather than
            // merge ambiguous identities — refuse with an actionable warning instead of a doomed POST.
            var dupes = participants.GroupBy(p => p.PlayerId).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
            if (dupes.Count > 0)
            {
                return MatchBuildResult.Refused(
                    $"Two in-game players resolved to the same account ({string.Join(", ", dupes)}); " +
                    "match not sent — each player must link their own account.");
            }

            var payload = new MatchPayload(
                MatchCode: match.MatchCode,
                Map: match.Map,
                StartedAt: Iso(match.StartedAt),
                // Clamp a backward clock step (NTP correction mid-game) to a zero-duration game — the
                // server rejects endedAt < startedAt, and losing the match to clock skew is worse.
                EndedAt: Iso(match.EndedAt.Value < match.StartedAt ? match.StartedAt : match.EndedAt.Value),
                Outcome: outcome,
                Participants: participants);

            return MatchBuildResult.Built(payload);
        }

        // ISO-8601 round-trip ("O") — always Date.parse-able on the server.
        private static string Iso(DateTimeOffset t) => t.ToString("O", CultureInfo.InvariantCulture);
    }
}
