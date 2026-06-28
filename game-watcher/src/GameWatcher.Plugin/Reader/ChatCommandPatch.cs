using GameWatcher.Core;
using HarmonyLib;

namespace GameWatcher.Plugin;

// Host-only /ranked command. Replies via RpcSendChat so the lobby sees the state.
// CRITICAL: Among Us's official servers KICK any client that sends a chat message longer than the
// ~100-char input limit (a vanilla client can't, so over-length reads as cheating). Every reply
// here MUST stay short — keep them well under that limit.
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
                Announce("Ranked: ON");
                break;
            case "off":
                RankedState.Enabled = false;
                Announce("Ranked: OFF");
                break;
            default: // bare "/ranked" or "/ranked status"
                Announce(StatusLine());
                break;
        }
    }

    // Must stay short (see class note) — no long URLs/paths in chat.
    private static string StatusLine() => $"Ranked: {(RankedState.Enabled ? "ON" : "OFF")} - {SiteLine()}";

    private static string SiteLine()
    {
        var host = GameWatcherPlugin.Host;
        if (host == null || !host.HasKey) return "no key set";
        if (!host.PolledOnce) return "checking";
        return host.LastStatus switch
        {
            RankedStatus.Enabled => "key valid",
            RankedStatus.Disabled => "key invalid",
            _ => "site down",
        };
    }

    private static void Announce(string message)
    {
        var local = PlayerControl.LocalPlayer;
        if (local != null) local.RpcSendChat(message);
    }
}
