using BepInEx;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;
using Reactor;

namespace GameWatcher.Plugin;

// Host-only ranked capture mod. Plan B builds the Game Reader + BrainHost on top of this.
// Phase-1 increment: loads under BepInEx (after Reactor), reads config, and registers the
// /ranked chat command (see ChatCommandPatch).
[BepInPlugin(Id, "GameWatcher Ranked", Version)]
[BepInProcess("Among Us.exe")]
[BepInDependency(ReactorPlugin.Id)]
public class GameWatcherPlugin : BasePlugin
{
    public const string Id = "com.amongus25.gamewatcher";
    public const string Version = "0.1.0";

    public Harmony Harmony { get; } = new(Id);
    public static PluginConfig Settings { get; private set; }
    public static BrainHost Host { get; private set; }

    public override void Load()
    {
        Settings = new PluginConfig(Config);
        RankedState.Enabled = Settings.RankedEnabled.Value;
        Host = new BrainHost(Settings);
        Host.Start();
        Log.LogInfo($"GameWatcher ranked mod loaded ({Id} v{Version}); ranked default = {RankedState.Enabled}; " +
                    $"hostKey set = {Host.HasKey}");
        Harmony.PatchAll();
    }
}
