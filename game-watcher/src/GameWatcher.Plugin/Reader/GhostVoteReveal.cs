using System;
using System.Text;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Ghost meeting helpers (QoL for the dead): while the LOCAL player is a ghost, (1) show a live,
// color-coded "who voted for whom" list, and (2) paint impostor names red. Both read live game state
// each frame and work fully for the HOST (which knows every vote target and every role); a non-host
// only learns vote targets at the reveal and never learns other players' roles. Harmless — the dead
// can't relay this to the living (ghost chat is separate).
public static class GhostVoteReveal
{
    private static readonly Color ImpRed = new Color(1f, 0.25f, 0.25f);
    private static TextMeshPro _overlay;
    private static MeetingHud _ownerHud; // the meeting the overlay belongs to (rebuild when it changes)

    [HarmonyPatch(typeof(MeetingHud), nameof(MeetingHud.Update))]
    public static class Patch
    {
        public static void Postfix(MeetingHud __instance)
        {
            try { Render(__instance); HighlightImpostors(__instance); }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[ghostvote] " + e.Message); }
        }
    }

    // Paint impostor names red in the vote list (ghosts only). Only sets red — never overrides the
    // colour of non-impostors or for living players.
    private static void HighlightImpostors(MeetingHud hud)
    {
        var lp = PlayerControl.LocalPlayer;
        if (lp == null || lp.Data == null || !lp.Data.IsDead) return; // ghosts only
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
        // Strip rich-text markup chars so a crafted player name can't inject tags into the overlay.
        string name = (pc.Data.PlayerName ?? "?").Replace("<", "").Replace(">", "");
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
        if (_overlay != null && _ownerHud == hud) return; // still valid for this meeting
        _overlay = null;                                  // a new meeting destroyed the old overlay -> rebuild
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
        _ownerHud = hud;
    }
}
