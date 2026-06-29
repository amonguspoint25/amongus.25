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
    public ConfigEntry<int> MinLinkedPlayers { get; }
    public ConfigEntry<string>[] OutfitSlots { get; }

    public PluginConfig(ConfigFile config)
    {
        WebsiteBaseUrl = config.Bind("GameWatcher", "WebsiteBaseUrl", "https://amongus25.com",
            "Base URL of the ranked website (no trailing slash).");
        HostKey = config.Bind("GameWatcher", "HostKey", "",
            "Your personal host key from the website /host page. Empty = mod dormant.");
        RankedEnabled = config.Bind("GameWatcher", "RankedEnabled", true,
            "Default ranked state at launch. /ranked on|off flips it at runtime.");
        TimerMinutes = config.Bind("GameWatcher", "TimerMinutes", 18,
            "Ranked task-deadline timer length, in minutes. Lower (e.g. 1) to test the force-end.");
        MinLinkedPlayers = config.Bind("GameWatcher", "MinLinkedPlayers", 10,
            "Minimum linked players required to start a ranked game. Lower (e.g. 2) to test with a few friends.");

        OutfitSlots = new ConfigEntry<string>[OutfitPresets.SlotCount];
        for (int i = 0; i < OutfitSlots.Length; i++)
            OutfitSlots[i] = config.Bind("Outfits", $"Slot{i + 1}", "",
                $"Saved outfit preset {i + 1} (hat|skin|visor|pet|nameplate - color excluded). Managed by the in-lobby outfit menu.");
    }
}
