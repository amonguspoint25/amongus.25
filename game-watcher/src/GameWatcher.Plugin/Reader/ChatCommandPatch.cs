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
        var lower = text.ToLowerInvariant();

        if (lower.StartsWith("/outfit")) { HandleOutfit(lower); return; }
        if (!lower.StartsWith("/ranked")) return;

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

    // Outfit presets (also driven by the in-lobby menu): "/outfit 3" wears slot 3, "/outfit save 3"
    // saves the current look into slot 3.
    private static void HandleOutfit(string lower)
    {
        var arg = lower.Length > 7 ? lower.Substring(7).Trim() : string.Empty;
        if (arg.StartsWith("save"))
        {
            var rest = arg.Substring(4).Trim();
            if (int.TryParse(rest, out var sn) && sn >= 1 && sn <= OutfitPresets.SlotCount)
                Announce(OutfitPresets.SaveCurrent(sn - 1) ? $"Outfit saved to slot {sn}" : "Outfit save failed");
            else
                Announce($"Usage: /outfit save 1-{OutfitPresets.SlotCount}");
            return;
        }
        if (int.TryParse(arg, out var n) && n >= 1 && n <= OutfitPresets.SlotCount)
        {
            if (!OutfitPresets.IsSet(n - 1)) Announce($"Slot {n} empty - /outfit save {n}");
            else Announce(OutfitPresets.Apply(n - 1) ? $"Wearing outfit slot {n}" : "Outfit apply failed");
            return;
        }
        Announce($"/outfit 1-{OutfitPresets.SlotCount} to wear, /outfit save N to save");
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
