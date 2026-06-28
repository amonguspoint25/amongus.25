using System;
using System.Linq;
using GameWatcher.Core;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core.Tests
{
    public class MatchRecorderTests
    {
        private static GameStarted Start() => new(
            "M1", "Skeld", DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
            new[]
            {
                new RosterEntry("imp", "Imp", Role.IMPOSTOR),
                new RosterEntry("c1", "C1", Role.CREW),
                new RosterEntry("c2", "C2", Role.CREW),
            });

        [Fact]
        public void Records_kills_survival_tasks_and_shots()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new TasksAssigned("c1", 5));
            r.Apply(new TasksAssigned("c2", 5));
            r.Apply(new TaskCompleted("c1", 100));
            r.Apply(new TaskCompleted("c1", 200));
            r.Apply(new PlayerKilled("imp", "c2", 300));      // imp kills c2
            r.Apply(new MeetingEnded("imp", new[]
            {
                new VoteCast("c1", "imp"),   // correct (targets impostor)
                new VoteCast("c2", "c1"),    // incorrect (targets crew)
                new VoteCast("imp", null),   // skipped vote — no shot
            }));
            r.Apply(new GameEnded(Outcome.CREW_WIN, DateTimeOffset.Parse("2026-06-27T17:15:00Z")));

            var snap = r.Snapshot();
            var imp = snap.Players.Single(p => p.InGameId == "imp");
            var c1 = snap.Players.Single(p => p.InGameId == "c1");
            var c2 = snap.Players.Single(p => p.InGameId == "c2");

            Assert.Equal(1, imp.Kills);
            Assert.False(imp.Survived);   // ejected this meeting
            Assert.False(c2.Survived);    // killed
            Assert.True(c1.Survived);
            Assert.Equal(2, c1.TasksDone);
            Assert.Equal(5, c1.TasksTotal);
            Assert.Equal(1, c1.CorrectShots);
            Assert.Equal(1, c2.IncorrectShots);
            Assert.Equal(Outcome.CREW_WIN, snap.Outcome);
            Assert.NotNull(snap.EndedAt);
        }

        [Fact]
        public void Clamps_tasksDone_to_total()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new TasksAssigned("c1", 2));
            for (var i = 0; i < 5; i++) r.Apply(new TaskCompleted("c1", i));

            Assert.Equal(2, r.Snapshot().Players.Single(p => p.InGameId == "c1").TasksDone);
        }

        [Fact]
        public void Ignores_events_for_unknown_players()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new PlayerKilled("ghost", "c1", 1)); // killer unknown -> ignored; victim still dies

            Assert.False(r.Snapshot().Players.Single(p => p.InGameId == "c1").Survived);
        }

        [Fact]
        public void Snapshot_without_game_throws()
        {
            Assert.Throws<InvalidOperationException>(() => new MatchRecorder().Snapshot());
        }

        [Fact]
        public void GameStarted_resets_previous_game()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new PlayerKilled("imp", "c1", 1));
            r.Apply(new GameStarted("M2", null, DateTimeOffset.Parse("2026-06-27T18:00:00Z"),
                new[] { new RosterEntry("imp", "Imp", Role.IMPOSTOR), new RosterEntry("c1", "C1", Role.CREW) }));

            var snap = r.Snapshot();
            Assert.Equal("M2", snap.MatchCode);
            Assert.True(snap.Players.Single(p => p.InGameId == "c1").Survived); // fresh
        }

        [Fact]
        public void Floors_negative_taskCount()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new TasksAssigned("c1", -5)); // buggy reader; server rejects negatives
            var c1 = r.Snapshot().Players.Single(p => p.InGameId == "c1");

            Assert.Equal(0, c1.TasksTotal);
            Assert.Equal(0, c1.TasksDone);
        }

        [Fact]
        public void MeetingEnded_ignores_unknown_voter_target_and_ejectee()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new MeetingEnded("ghost", new[]
            {
                new VoteCast("ghost", "imp"),  // unknown voter -> no shot credited
                new VoteCast("c1", "ghost"),   // unknown target -> no shot
                new VoteCast("c1", "imp"),     // valid -> c1 gets one correct shot
            }));
            var snap = r.Snapshot();

            Assert.Equal(1, snap.Players.Single(p => p.InGameId == "c1").CorrectShots);
            Assert.Equal(0, snap.Players.Single(p => p.InGameId == "c1").IncorrectShots);
            Assert.True(snap.Players.Single(p => p.InGameId == "imp").Survived); // off-roster ejectee no-op
        }

        [Fact]
        public void Counts_rounds_survived_excluding_ejection_and_death_rounds()
        {
            var r = new MatchRecorder();
            r.Apply(Start()); // roster: imp, c1, c2
            // Meeting 1: nobody ejected -> imp, c1, c2 each +1
            r.Apply(new MeetingEnded(null, System.Array.Empty<VoteCast>()));
            // c2 killed during round 2
            r.Apply(new PlayerKilled("imp", "c2", 1000));
            // Meeting 2: imp ejected -> c1 +1 (alive, not ejected); imp gets NO credit (ejected here); c2 dead, no credit
            r.Apply(new MeetingEnded("imp", System.Array.Empty<VoteCast>()));
            r.Apply(new GameEnded(Outcome.CREW_WIN, DateTimeOffset.Parse("2026-06-27T17:15:00Z")));

            var snap = r.Snapshot();
            Assert.Equal(1, snap.Players.Single(p => p.InGameId == "imp").RoundsSurvived); // survived meeting 1 only
            Assert.Equal(2, snap.Players.Single(p => p.InGameId == "c1").RoundsSurvived);  // both meetings
            Assert.Equal(1, snap.Players.Single(p => p.InGameId == "c2").RoundsSurvived);  // meeting 1; dead by meeting 2
        }

        [Fact]
        public void Captures_first_kill_and_first_task_times()
        {
            var r = new MatchRecorder();
            r.Apply(Start());
            r.Apply(new TasksAssigned("c1", 5));
            r.Apply(new TaskCompleted("c1", 4200));   // first task time
            r.Apply(new TaskCompleted("c1", 9000));   // later — ignored for first-task
            r.Apply(new PlayerKilled("imp", "c2", 12000)); // first kill time
            r.Apply(new PlayerKilled("imp", "c1", 30000)); // later kill — ignored for first-kill
            r.Apply(new GameEnded(Outcome.IMP_WIN, DateTimeOffset.Parse("2026-06-27T17:15:00Z")));

            var snap = r.Snapshot();
            Assert.Equal(12000, snap.Players.Single(p => p.InGameId == "imp").TimeToKillMs);
            Assert.Equal(4200, snap.Players.Single(p => p.InGameId == "c1").TimeToTaskMs);
            Assert.Null(snap.Players.Single(p => p.InGameId == "c2").TimeToKillMs); // never killed anyone
        }
    }
}
