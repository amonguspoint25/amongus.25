using System.Collections.Generic;

namespace GameWatcher.Core.Domain
{
    // The exact body of POST /api/ingest/match. Field-for-field with src/lib/ingest/schema.ts
    // (matchPayloadSchema). Serialized via GameWatcherJson (camelCase + omit-null).

    public sealed record MatchPayload(
        string MatchCode,
        string? Map,                 // omitted when null (schema: map?:string)
        string StartedAt,            // ISO-8601, must be Date.parse-able; endedAt >= startedAt
        string EndedAt,
        Outcome Outcome,
        IReadOnlyList<Participant> Participants);

    public sealed record Participant(
        string PlayerId,             // OPAQUE id from /api/link — NOT discordId
        Role Role,
        bool Won,                    // DERIVED from role+outcome; server rejects inconsistent values
        int Kills,
        int CorrectShots,
        int IncorrectShots,
        int TasksDone,               // server requires TasksDone <= TasksTotal
        int TasksTotal,
        bool Survived,
        int RoundsSurvived = 0,      // count of meeting rounds alive-and-not-ejected (spec §10)
        int? TimeToKillMs = null,    // DEFERRED no longer — derived by the recorder (Task 3)
        int? TimeToTaskMs = null,
        bool Disconnected = false);  // DC'd before game end — server nullifies their ELO (no gain/loss)
}
