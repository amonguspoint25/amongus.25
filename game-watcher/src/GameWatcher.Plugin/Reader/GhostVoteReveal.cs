using System;
using System.Text;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Dead-player vote tracker: while the LOCAL player is a ghost, show a live, color-coded list of who
// voted for whom during a meeting. Reads MeetingHud.playerStates each frame. Works fully for the host
// (which knows every vote target as it tallies them); a non-host only has targets once AU reveals
// them. Harmless QoL — the dead can't relay it to the living (ghost chat is separate).
public static class GhostVoteReveal
{
    private static TextMeshPro _overlay;

    [HarmonyPatch(typeof(MeetingHud), nameof(MeetingHud.Update))]
    public static class Patch
    {
        public static void Postfix(MeetingHud __instance)
        {
            try { Render(__instance); }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[ghostvote] " + e.Message); }
        }
    }

    private static void Render(MeetingHud hud)
    {
        var lp = PlayerControl.LocalPlayer;
        bool ghost = lp != null && lp.Data != null && lp.Data.IsDead; // ghosts only
        var states = hud != null ? hud.playerStates : null;
        if (!ghost || states == null)
        {
            if (_overlay != null) _overlay.gameObject.SetActive(false);
            return;
        }

        var sb = new StringBuilder("<b>VOTES</b>\n");
        int shown = 0;
        for (int i = 0; i < states.Length; i++)
        {
            var a = states[i];
            if (a == null || !a.DidVote) continue;
            var voter = PlayerById(a.TargetPlayerId);
            if (voter == null) continue;

            int vf = a.VotedFor;
            string target = vf < 250 ? ColoredName(PlayerById((byte)vf)) : "<color=#9aa0a6>skip</color>";
            if (target == null) continue; // target not resolvable (e.g. non-host, pre-reveal)

            sb.Append(ColoredName(voter)).Append(" → ").Append(target).Append('\n');
            shown++;
        }

        EnsureOverlay(hud);
        if (_overlay == null) return;
        _overlay.gameObject.SetActive(true);
        _overlay.text = shown > 0 ? sb.ToString() : "<b>VOTES</b>\n<color=#9aa0a6>none yet</color>";
    }

    private static string ColoredName(PlayerControl pc)
    {
        if (pc == null || pc.Data == null) return null;
        string name = pc.Data.PlayerName ?? "?";
        try
        {
            var c = Palette.PlayerColors[pc.Data.DefaultOutfit.ColorId];
            return $"<color=#{c.r:X2}{c.g:X2}{c.b:X2}>{name}</color>";
        }
        catch { return name; }
    }

    private static PlayerControl PlayerById(byte id)
    {
        var all = PlayerControl.AllPlayerControls;
        for (int i = 0; i < all.Count; i++)
            if (all[i] != null && all[i].PlayerId == id) return all[i];
        return null;
    }

    private static void EnsureOverlay(MeetingHud hud)
    {
        if (_overlay != null) return;
        // Clone a meeting name label so we inherit the meeting font/material/sorting layer.
        TextMeshPro src = null;
        var states = hud.playerStates;
        if (states != null && states.Length > 0 && states[0] != null) src = states[0].NameText;
        if (src == null) return;

        _overlay = UnityEngine.Object.Instantiate(src, hud.transform);
        _overlay.gameObject.name = "GhostVotes";
        _overlay.transform.localPosition = new Vector3(2.7f, 1.7f, -50f); // right of the vote grid
        _overlay.transform.localScale = Vector3.one;
        _overlay.alignment = TextAlignmentOptions.TopLeft;
        _overlay.enableAutoSizing = false;
        _overlay.enableWordWrapping = false;
        _overlay.fontSize = 1.5f;
        _overlay.richText = true;
        _overlay.color = Color.white;
        var r = _overlay.GetComponent<Renderer>();
        if (r != null) r.sortingOrder = 100; // above the meeting UI
    }
}
