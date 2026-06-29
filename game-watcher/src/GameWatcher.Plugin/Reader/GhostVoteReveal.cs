using System;
using HarmonyLib;
using UnityEngine;

namespace GameWatcher.Plugin;

// Ghost meeting helpers (QoL for the dead). While the LOCAL player is a ghost:
//  (1) reveal each vote with the real voter colour on AU's own vote icons, even if Anonymous Votes is
//      on — i.e. "anon votes off, but only for you" (a no-op when anon is already off, as ranked forces);
//  (2) paint impostor names red.
// Both are local-only and can't be relayed to the living (ghost chat is separate).
public static class GhostVoteReveal
{
    private static readonly Color ImpRed = new Color(1f, 0.25f, 0.25f);

    private static bool LocalIsGhost()
    {
        var lp = PlayerControl.LocalPlayer;
        return lp != null && lp.Data != null && lp.Data.IsDead;
    }

    // (1) Un-anonymize the reveal: recolor each freshly-bloop'd vote icon to the real voter's colour.
    [HarmonyPatch(typeof(MeetingHud), nameof(MeetingHud.BloopAVoteIcon))]
    public static class VoteIconReveal
    {
        public static void Postfix(NetworkedPlayerInfo voterPlayer, int index, Transform parent)
        {
            try
            {
                if (!LocalIsGhost() || voterPlayer == null || parent == null || parent.childCount == 0) return;
                var icon = parent.GetChild(parent.childCount - 1).GetComponentInChildren<SpriteRenderer>(); // the icon just added
                if (icon != null) PlayerMaterial.SetColors(voterPlayer.DefaultOutfit.ColorId, icon);
            }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[ghostvote] icon: " + e.Message); }
        }
    }

    // (2) Paint impostor names red in the vote list (ghosts only).
    [HarmonyPatch(typeof(MeetingHud), nameof(MeetingHud.Update))]
    public static class ImpostorHighlight
    {
        public static void Postfix(MeetingHud __instance)
        {
            try { Highlight(__instance); }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[ghostvote] hl: " + e.Message); }
        }
    }

    private static void Highlight(MeetingHud hud)
    {
        if (!LocalIsGhost()) return;
        var states = hud != null ? hud.playerStates : null;
        if (states == null) return;
        for (int i = 0; i < states.Length; i++)
        {
            var a = states[i];
            if (a == null || a.NameText == null) continue;
            var pc = PlayerById(a.TargetPlayerId);
            if (pc != null && pc.Data != null && pc.Data.Role != null && pc.Data.Role.IsImpostor)
                a.NameText.color = ImpRed;
        }
    }

    private static PlayerControl PlayerById(byte id)
    {
        var all = PlayerControl.AllPlayerControls;
        for (int i = 0; i < all.Count; i++)
            if (all[i] != null && all[i].PlayerId == id) return all[i];
        return null;
    }
}
