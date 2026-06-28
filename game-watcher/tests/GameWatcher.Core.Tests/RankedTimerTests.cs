using GameWatcher.Core;

namespace GameWatcher.Core.Tests
{
    public class RankedTimerTests
    {
        [Fact]
        public void Partial_tick_does_not_expire()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            Assert.False(t.Tick(400));
            Assert.Equal(600, t.RemainingMs);
            Assert.False(t.HasExpired);
        }

        [Fact]
        public void Crossing_zero_returns_true_exactly_once()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            Assert.False(t.Tick(600));
            Assert.True(t.Tick(600));   // crosses zero
            Assert.False(t.Tick(10));   // already expired
            Assert.True(t.HasExpired);
            Assert.Equal(0, t.RemainingMs);
        }

        [Fact]
        public void Exact_zero_expires()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            Assert.True(t.Tick(1000));
            Assert.True(t.HasExpired);
        }

        [Fact]
        public void Pause_freezes_and_resume_continues()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            t.Pause();
            Assert.False(t.Tick(500));
            Assert.Equal(1000, t.RemainingMs); // frozen
            t.Resume();
            Assert.False(t.Tick(400));
            Assert.Equal(600, t.RemainingMs);
        }

        [Fact]
        public void Pause_and_resume_are_idempotent()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            t.Pause(); t.Pause();
            t.Resume(); t.Resume();
            t.Tick(200);
            Assert.Equal(800, t.RemainingMs);
        }

        [Fact]
        public void No_resurrection_after_expiry()
        {
            var t = new RankedTimer();
            t.Reset(500);
            Assert.True(t.Tick(500));
            t.Resume();
            Assert.False(t.Tick(100));
            Assert.Equal(0, t.RemainingMs);
            Assert.True(t.HasExpired);
        }
    }
}
