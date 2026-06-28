using BepInEx;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;
using Reactor;

namespace GameWatcher.Plugin;

// Host-only ranked capture mod. Plan B builds the Game Reader + BrainHost on top of this.
// For now this is the Phase-0 skeleton: it loads under BepInEx (after Reactor) and logs, proving
// the toolchain builds and the plugin is discovered on this Among Us build.
[BepInAutoPlugin("com.amongus25.gamewatcher")]
[BepInProcess("Among Us.exe")]
[BepInDependency(ReactorPlugin.Id)]
public partial class GameWatcherPlugin : BasePlugin
{
    public Harmony Harmony { get; } = new(Id);

    public override void Load()
    {
        Log.LogInfo($"GameWatcher ranked mod loaded ({Id} v{Version})");
        Harmony.PatchAll();
    }
}
