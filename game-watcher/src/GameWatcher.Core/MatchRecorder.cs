using System;
using System.Collections.Generic;
using System.Linq;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core
{
    // Immutable snapshot the MatchBuilder consumes (won is derived later, by role+outcome).
    public sealed record PlayerTally(
        string InGameId,
        string Name,
        Role Role,
        int Kills,
        int CorrectShots,
        int IncorrectShots,
        int TasksDone,
        int TasksTotal,
        bool Survived);

    public sealed record RecordedMatch(
        string MatchCode,
        string? Map,
        DateTimeOffset StartedAt,
        DateTimeOffset? EndedAt,
        Outcome? Outcome,
        IReadOnlyList<PlayerTally> Players);

    // Accumulates normalized events into a per-in-game-player tally for ONE game.
    // ponytail: a recorder is inherently stateful — accumulate in place, expose an
    // immutable snapshot. Rebuilding the whole tally per event would be pure waste.
    // Events naming an in-game id NOT in the GameStarted roster are ignored (the roster
    // is authoritative; a kill by a ghost id can't happen in a real game).
    public sealed class MatchRecorder
    {
        private sealed class Tally
        {
            public Role Role;
            public string Name = string.Empty;
            public int Kills;
            public int CorrectShots;
            public int IncorrectShots;
            public int TasksDone;
            public int TasksTotal;
            public bool Survived = true;
        }

        private readonly Dictionary<string, Tally> _players = new();
        private string? _matchCode;
        private string? _map;
        private DateTimeOffset _startedAt;
        private DateTimeOffset? _endedAt;
        private Outcome? _outcome;

        public bool HasGame => _matchCode != null;

        public void Apply(GameEvent e)
        {
            switch (e)
            {
                case GameStarted gs:
                    Reset(gs);
                    break;
                case TasksAssigned ta when _players.TryGetValue(ta.InGameId, out var t1):
                    // Floor at 0: tasksTotal is the only numeric field taken verbatim from the reader,
                    // and the server rejects negatives (400 -> permanent drop). Same spirit as the
                    // tasksDone clamp below.
                    t1.TasksTotal = Math.Max(0, ta.TaskCount);
                    break;
                case TaskCompleted tc when _players.TryGetValue(tc.InGameId, out var t2):
                    t2.TasksDone++;
                    break;
                case PlayerKilled pk:
                    if (_players.TryGetValue(pk.KillerInGameId, out var killer)) killer.Kills++;
                    if (_players.TryGetValue(pk.VictimInGameId, out var victim)) victim.Survived = false;
                    break;
                case MeetingEnded me:
                    ApplyMeeting(me);
                    break;
                case GameEnded ge:
                    _outcome = ge.Outcome;
                    _endedAt = ge.EndedAt;
                    break;
                // ChatMessage and unmatched-id events are intentionally no-ops here
                // (chat is the LinkManager's job).
            }
        }

        private void ApplyMeeting(MeetingEnded me)
        {
            if (me.EjectedInGameId != null && _players.TryGetValue(me.EjectedInGameId, out var ejected))
                ejected.Survived = false;

            foreach (var vote in me.Votes)
            {
                if (vote.TargetInGameId == null) continue;                       // skipped vote
                if (!_players.TryGetValue(vote.VoterInGameId, out var voter)) continue;
                if (!_players.TryGetValue(vote.TargetInGameId, out var target)) continue;

                // "Shot" = a vote you cast. Correct if it targeted an IMPOSTOR (spec §5.4).
                if (target.Role == Role.IMPOSTOR) voter.CorrectShots++;
                else voter.IncorrectShots++;
            }
        }

        private void Reset(GameStarted gs)
        {
            _players.Clear();
            _matchCode = gs.MatchCode;
            _map = gs.Map;
            _startedAt = gs.StartedAt;
            _endedAt = null;
            _outcome = null;
            foreach (var r in gs.Roster)
                _players[r.InGameId] = new Tally { Role = r.Role, Name = r.Name };
        }

        public RecordedMatch Snapshot()
        {
            if (_matchCode == null)
                throw new InvalidOperationException("No game has started; nothing to snapshot.");

            var players = _players
                .Select(kv => new PlayerTally(
                    InGameId: kv.Key,
                    Name: kv.Value.Name,
                    Role: kv.Value.Role,
                    Kills: kv.Value.Kills,
                    CorrectShots: kv.Value.CorrectShots,
                    IncorrectShots: kv.Value.IncorrectShots,
                    // Clamp so a noisy reader can never violate the server's tasksDone<=tasksTotal
                    // invariant and 400 the whole match. Losing one stray completion beats losing
                    // the match.
                    TasksDone: Math.Min(kv.Value.TasksDone, kv.Value.TasksTotal),
                    TasksTotal: kv.Value.TasksTotal,
                    Survived: kv.Value.Survived))
                .ToList();

            return new RecordedMatch(_matchCode, _map, _startedAt, _endedAt, _outcome, players);
        }
    }
}
