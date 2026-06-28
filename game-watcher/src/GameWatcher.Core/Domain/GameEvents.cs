using System;
using System.Collections.Generic;

namespace GameWatcher.Core.Domain
{
    // Normalized events: the Game Reader (Plan #3, Among Us-only) → Match Brain interface.
    // This boundary is what makes the brain testable without the game (spec §5.3).
    // These are INTERNAL types — never serialized to the wire.

    public abstract record GameEvent;

    public sealed record RosterEntry(string InGameId, string Name, Role Role);

    public sealed record GameStarted(
        string MatchCode,
        string? Map,
        DateTimeOffset StartedAt,
        IReadOnlyList<RosterEntry> Roster) : GameEvent;

    public sealed record TasksAssigned(string InGameId, int TaskCount) : GameEvent;

    public sealed record PlayerKilled(string KillerInGameId, string VictimInGameId, long AtMs) : GameEvent;

    public sealed record TaskCompleted(string InGameId, long AtMs) : GameEvent;

    // A player disconnected before the game ended. Their ELO is nullified (no gain/loss) but the
    // match still counts for everyone else.
    public sealed record PlayerLeft(string InGameId) : GameEvent;

    public sealed record VoteCast(string VoterInGameId, string? TargetInGameId);

    public sealed record MeetingEnded(string? EjectedInGameId, IReadOnlyList<VoteCast> Votes) : GameEvent;

    public sealed record ChatMessage(string SenderInGameId, string Text) : GameEvent;

    public sealed record GameEnded(Outcome Outcome, DateTimeOffset EndedAt) : GameEvent;
}
