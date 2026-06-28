namespace GameWatcher.Core
{
    // Pure, frame-driven countdown for the ranked task deadline (spec §8). The plugin feeds it
    // real elapsed time via Tick and pauses it during meetings. It decides who wins when the crew
    // runs out of time, so its accounting is unit-tested here, away from the game.
    public sealed class RankedTimer
    {
        public long RemainingMs { get; private set; }
        public bool IsRunning { get; private set; }
        public bool HasExpired { get; private set; }

        // Start (or restart) the countdown: running, not expired.
        public void Reset(long durationMs)
        {
            RemainingMs = durationMs < 0 ? 0 : durationMs;
            IsRunning = true;
            HasExpired = false;
        }

        // Stop / resume counting (both idempotent; both no-ops once expired).
        public void Pause() { if (!HasExpired) IsRunning = false; }
        public void Resume() { if (!HasExpired) IsRunning = true; }

        // Advance by deltaMs of real time. Only counts while running. Returns true EXACTLY ONCE,
        // on the tick that reaches zero, so the caller fires the end-game action just once.
        public bool Tick(long deltaMs)
        {
            if (!IsRunning || HasExpired || deltaMs <= 0) return false;
            RemainingMs -= deltaMs;
            if (RemainingMs > 0) return false;
            RemainingMs = 0;
            IsRunning = false;
            HasExpired = true;
            return true;
        }
    }
}
