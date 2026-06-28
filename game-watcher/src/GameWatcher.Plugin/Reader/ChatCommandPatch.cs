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
                Announce("Ranked is now ON for this lobby. Everyone must be linked on the website.");
                break;
            case "off":
                RankedState.Enabled = false;
                Announce("Ranked is now OFF.");
                break;
            default:
                Announce(RankedState.Enabled
                    ? "Ranked: ON  (use /ranked off to disable)"
                    : "Ranked: OFF  (use /ranked on to enable)");
                break;
        }
    }

    private static void Announce(string message)
    {
        var local = PlayerControl.LocalPlayer;
        if (local != null) local.RpcSendChat(message);
    }
}
