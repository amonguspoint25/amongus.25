using BepInEx.Configuration;

namespace GameWatcher.Plugin;

// Strongly-typed view over the BepInEx config file (BepInEx/config/com.amongus25.gamewatcher.cfg).
// The host pastes their key + site URL once; ranked on/off is flipped at runtime by /ranked.
public sealed class PluginConfig
{
    public ConfigEntry<string> WebsiteBaseUrl { get; }
    public ConfigEntry<string> HostKey { get; }
    public ConfigEntry<bool> RankedEnabled { get; }
    public ConfigEntry<int> TimerMinutes { get; }

    public PluginConfig(ConfigFile config)
    {
        WebsiteBaseUrl = config.Bind("GameWatcher", "WebsiteBaseUrl", "https://au-25.vercel.app",
            "Base URL of the ranked website (no trailing slash).");
        HostKey = config.Bind("GameWatcher", "HostKey", "",
            "Your personal host key from the website /host page. Empty = mod dormant.");
        RankedEnabled = config.Bind("GameWatcher", "RankedEnabled", true,
            "Default ranked state at launch. /ranked on|off flips it at runtime.");
        TimerMinutes = config.Bind("GameWatcher", "TimerMinutes", 18,
            "Ranked task-deadline timer length, in minutes.");
    }
}
