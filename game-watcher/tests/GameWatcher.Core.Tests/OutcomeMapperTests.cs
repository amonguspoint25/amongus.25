using GameWatcher.Core.Domain;
using Xunit;

namespace GameWatcher.Core.Tests
{
    public class OutcomeMapperTests
    {
        [Theory]
        // Current AU build (the names that were silently inverting wins)
        [InlineData("CrewmatesByVote", Outcome.CREW_WIN)]
        [InlineData("CrewmatesByTask", Outcome.CREW_WIN)]
        [InlineData("ImpostorsByVote", Outcome.IMP_WIN)]
        [InlineData("ImpostorsByKill", Outcome.IMP_WIN)]
        [InlineData("ImpostorsBySabotage", Outcome.IMP_WIN)]
        // Legacy AU names (pre-rename) must still work
        [InlineData("HumansByVote", Outcome.CREW_WIN)]
        [InlineData("HumansByTask", Outcome.CREW_WIN)]
        [InlineData("ImpostorByVote", Outcome.IMP_WIN)]
        [InlineData("ImpostorByKill", Outcome.IMP_WIN)]
        // Disconnect endings name WHO LEFT (the loser) -> the other side wins
        [InlineData("ImpostorDisconnect", Outcome.CREW_WIN)]
        [InlineData("CrewmateDisconnect", Outcome.IMP_WIN)]
        [InlineData("HumansDisconnect", Outcome.IMP_WIN)]
        public void Maps_reason_name_to_correct_winner(string reason, Outcome expected)
            => Assert.Equal(expected, OutcomeMapper.FromReasonName(reason));
    }
}
