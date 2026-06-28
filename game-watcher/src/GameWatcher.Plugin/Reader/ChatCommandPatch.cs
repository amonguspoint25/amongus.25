using GameWatcher.Core;
using HarmonyLib;

namespace GameWatcher.Plugin;

// Host-only /ranked command. Among Us is host-authoritative, so the host's client sees every chat
// line via ChatController.AddChat; we only act on the LOCAL player (the host) to prevent other
// players from toggling ranked. The reply goes out via RpcSendChat so the whole (unmodded) lobby
// sees the state. Replies never start with "/ranked", so they can't re-trigger this handler.
[HarmonyPatch(typeof(ChatController), nameof(ChatController.AddChat))]
public static class ChatCommandPatch
{
    public static void Postfix(PlayerControl sourcePlayer, string chatText)
    {
        var local = PlayerControl.LocalPlayer;
        if (local == null || sourcePlayer == null || sourcePlayer.PlayerId != local.PlayerId) return;

        var text = (chatText ?? string.Empty).Trim();
        if (!text.ToLowerInvariant().StartsWith("/ranked")) return;

        var arg = text.Length > 7 ? text.Substring(7).Trim().ToLowerInvariant() : string.Empty;
        switch (arg)
        {
            case "on":
                RankedState.Enabled = true;
                Announce("Ranked is now ON for this lobby. Everyone must be linked on the website. " + SiteLine());
                break;
            case "off":
                RankedState.Enabled = false;
                Announce("Ranked is now OFF.");
                break;
            default: // bare "/ranked" or "/ranked status"
                Announce(StatusLine());
                break;
        }
    }

    private static string StatusLine() => $"Ranked: {(RankedState.Enabled ? "ON" : "OFF")}  |  {SiteLine()}";

    // Live host-key validity from the background poll (read-only, no marshaling).
    private static string SiteLine()
    {
        var host = GameWatcherPlugin.Host;
        if (host == null || !host.HasKey) return "no host key set (BepInEx/config/com.amongus25.gamewatcher.cfg)";
        if (!host.PolledOnce) return "checking site…";
        return host.LastStatus switch
        {
            RankedStatus.Enabled => "host key valid - ready to record",
            RankedStatus.Disabled => "host key INVALID or revoked",
            _ => "site unreachable (check WebsiteBaseUrl)",
        };
    }

    private static void Announce(string message)
    {
        var local = PlayerControl.LocalPlayer;
        if (local != null) local.RpcSendChat(message);
    }
}
