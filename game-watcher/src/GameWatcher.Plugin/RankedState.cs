namespace GameWatcher.Plugin;

// Runtime ranked on/off intent, toggled by the host via the /ranked chat command and initialized
// from config at load. The host key (not this flag) is the real auth boundary; this is just the
// local "is this lobby meant to be ranked" switch the HUD and gate read.
public static class RankedState
{
    public static bool Enabled;
}
