using System;
using System.Collections.Generic;
using System.Linq;
using GameWatcher.Core;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core.Tests
{
    public class MatchBuilderTests
    {
        private static RecordedMatch Recorded(Outcome? outcome = Outcome.IMP_WIN) => new(
            "M1", "Skeld",
            DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
            outcome == null ? (DateTimeOffset?)null : DateTimeOffset.Parse("2026-06-27T17:15:00Z"),
            outcome,
            new[]
            {
                new PlayerTally("imp", "Imp", Role.IMPOSTOR, 2, 0, 0, 0, 0, true),
                new PlayerTally("c1", "C1", Role.CREW, 0, 1, 0, 3, 5, true),
                new PlayerTally("c2", "C2", Role.CREW, 0, 0, 1, 5, 5, false),
            });

        private static Dictionary<string, string> FullMap() =>
            new() { ["imp"] = "P_imp", ["c1"] = "P_c1", ["c2"] = "P_c2" };

        [Fact]
        public void Builds_payload_and_derives_won()
        {
            var res = new MatchBuilder().Build(Recorded(), FullMap());

            Assert.True(res.Ok);
            var pay = res.Payload!;
            Assert.Equal("M1", pay.MatchCode);
            Assert.Equal(3, pay.Participants.Count);
            Assert.True(pay.Participants.Single(p => p.PlayerId == "P_imp").Won);   // IMP_WIN
            Assert.False(pay.Participants.Single(p => p.PlayerId == "P_c1").Won);
            // Pin the actual values + ordering — not just parseability — so a field swap is caught.
            Assert.Equal(DateTimeOffset.Parse("2026-06-27T17:00:00Z"), DateTimeOffset.Parse(pay.StartedAt));
            Assert.Equal(DateTimeOffset.Parse("2026-06-27T17:15:00Z"), DateTimeOffset.Parse(pay.EndedAt));
            Assert.True(DateTimeOffset.Parse(pay.EndedAt) >= DateTimeOffset.Parse(pay.StartedAt));
        }

        [Fact]
        public void Drops_unlinked_players()
        {
            var map = new Dictionary<string, string> { ["imp"] = "P_imp", ["c1"] = "P_c1" }; // c2 unlinked
            var res = new MatchBuilder().Build(Recorded(), map);

            Assert.True(res.Ok);
            Assert.Equal(2, res.Payload!.Participants.Count);
            Assert.DoesNotContain(res.Payload.Participants, p => p.PlayerId == "P_c2");
        }

        [Fact]
        public void Refuses_when_a_whole_role_is_unlinked()
        {
            var map = new Dictionary<string, string> { ["c1"] = "P_c1", ["c2"] = "P_c2" }; // impostor unlinked
            var res = new MatchBuilder().Build(Recorded(), map);

            Assert.False(res.Ok);
            Assert.Null(res.Payload);
            Assert.Contains("impostor", res.Warning!, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Refuses_when_game_has_no_outcome()
        {
            var res = new MatchBuilder().Build(Recorded(outcome: null), FullMap());

            Assert.False(res.Ok);
            Assert.Contains("not ended", res.Warning!, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Refuses_when_ended_but_endedAt_missing()
        {
            // Independently pin the EndedAt==null sub-condition (kills the ||->&& mutant).
            var m = new RecordedMatch("M1", "Skeld", DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
                null, Outcome.IMP_WIN,
                new[] { new PlayerTally("imp", "Imp", Role.IMPOSTOR, 2, 0, 0, 0, 0, true) });
            var res = new MatchBuilder().Build(m, new Dictionary<string, string> { ["imp"] = "P_imp" });

            Assert.False(res.Ok);
            Assert.Contains("not ended", res.Warning!, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Refuses_duplicate_playerId()
        {
            // Two in-game slots resolving to one account => duplicate playerId => server 400.
            var map = new Dictionary<string, string> { ["imp"] = "P_imp", ["c1"] = "P_dup", ["c2"] = "P_dup" };
            var res = new MatchBuilder().Build(Recorded(), map);

            Assert.False(res.Ok);
            Assert.Contains("same account", res.Warning!, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Clamps_endedAt_before_startedAt_to_zero_duration()
        {
            var m = new RecordedMatch("M1", null,
                DateTimeOffset.Parse("2026-06-27T17:10:00Z"),
                DateTimeOffset.Parse("2026-06-27T17:00:00Z"), // ended BEFORE started (clock step)
                Outcome.IMP_WIN,
                new[]
                {
                    new PlayerTally("imp", "Imp", Role.IMPOSTOR, 1, 0, 0, 0, 0, true),
                    new PlayerTally("c1", "C1", Role.CREW, 0, 0, 0, 1, 1, true),
                });
            var res = new MatchBuilder().Build(m, new Dictionary<string, string> { ["imp"] = "P_imp", ["c1"] = "P_c1" });

            Assert.True(res.Ok);
            Assert.True(DateTimeOffset.Parse(res.Payload!.EndedAt) >= DateTimeOffset.Parse(res.Payload.StartedAt));
            Assert.Equal(DateTimeOffset.Parse(res.Payload.StartedAt), DateTimeOffset.Parse(res.Payload.EndedAt));
        }
    }
}
