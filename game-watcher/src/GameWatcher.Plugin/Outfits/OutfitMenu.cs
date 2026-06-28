using System;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Outfit preset panel injected into Among Us's customization screen (PlayerCustomizationMenu). Six
// slot buttons cloned from the menu's native Equip button. Clicking a slot WEARS it and makes it the
// active slot; while a slot is active, any cosmetic change you equip auto-saves into it. No save
// button — the active slot simply mirrors your current look (and the highlight shows which one).
public static class OutfitMenu
{
    private static GameObject[] _slots;
    private static TextMeshPro[] _slotText;
    private static int _activeSlot = -1;
    private static OutfitData _lastOutfit;

    [HarmonyPatch(typeof(PlayerCustomizationMenu), nameof(PlayerCustomizationMenu.Start))]
    public static class BuildPatch
    {
        public static void Postfix(PlayerCustomizationMenu __instance)
        {
            try { Build(__instance); }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[outfit] build: " + e.Message); }
        }
    }

    [HarmonyPatch(typeof(PlayerCustomizationMenu), nameof(PlayerCustomizationMenu.Update))]
    public static class TickPatch
    {
        public static void Postfix()
        {
            try { HandleClicks(); AutoSave(); Refresh(); }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[outfit] tick: " + e.Message); }
        }
    }

    private static void Build(PlayerCustomizationMenu menu)
    {
        var src = menu.equipButton;
        if (src == null) { GameWatcherPlugin.Logger?.LogWarning("[outfit] no equipButton to clone"); return; }
        _activeSlot = -1;
        _lastOutfit = OutfitPresets.Capture();
        _slots = new GameObject[OutfitPresets.SlotCount];
        _slotText = new TextMeshPro[OutfitPresets.SlotCount];

        var basePos = src.transform.localPosition;
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] equipButton local={basePos} cam={(Camera.main != null ? Camera.main.name : "null")}");

        // 3x2 grid — coordinates are first-pass guesses, calibrated against the logged anchor later.
        for (int i = 0; i < OutfitPresets.SlotCount; i++)
        {
            int col = i % 3, row = i / 3;
            _slots[i] = CloneButton(src, new Vector3(-3.4f + col * 1.15f, 1.3f - row * 0.95f, basePos.z), $"{i + 1}", out _slotText[i]);
        }
        Refresh();
        GameWatcherPlugin.Logger?.LogInfo("[outfit] panel built in customization menu");
    }

    private static GameObject CloneButton(GameObject src, Vector3 local, string label, out TextMeshPro txt)
    {
        var go = UnityEngine.Object.Instantiate(src, src.transform.parent);
        go.name = "OutfitSlot_" + label;
        go.transform.localPosition = local;
        go.transform.localScale = src.transform.localScale * 0.62f;
        go.SetActive(true);
        var pb = go.GetComponent<PassiveButton>();
        txt = pb != null && pb.buttonText != null ? pb.buttonText : go.GetComponentInChildren<TextMeshPro>();
        if (txt != null) txt.text = label;
        return go;
    }

    // Selecting a slot wears it (or, if empty, captures your current look into it) and makes it active.
    private static void HandleClicks()
    {
        if (_slots == null || !Input.GetMouseButtonDown(0)) return;
        var cam = Camera.main;
        if (cam == null) return;
        Vector3 m = cam.ScreenToWorldPoint(Input.mousePosition);

        for (int i = 0; i < _slots.Length; i++)
        {
            if (!Hit(_slots[i], m)) continue;
            _activeSlot = i;
            if (OutfitPresets.IsSet(i)) OutfitPresets.Apply(i);
            else OutfitPresets.Store(i, OutfitPresets.Capture()); // empty slot captures current
            _lastOutfit = OutfitPresets.Capture();
            GameWatcherPlugin.Logger?.LogInfo($"[outfit] active slot {i + 1}");
            return;
        }
    }

    // While a slot is active, mirror any equipped change into it.
    private static void AutoSave()
    {
        if (_activeSlot < 0) return;
        var cur = OutfitPresets.Capture();
        if (cur == null || cur.SameAs(_lastOutfit)) return;
        OutfitPresets.Store(_activeSlot, cur);
        _lastOutfit = cur;
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] auto-saved slot {_activeSlot + 1}");
    }

    private static void Refresh()
    {
        if (_slotText == null) return;
        for (int i = 0; i < _slotText.Length; i++)
        {
            if (_slotText[i] == null) continue;
            _slotText[i].text = OutfitPresets.IsSet(i) ? $"{i + 1}" : $"{i + 1}·"; // dot = empty
            _slotText[i].color = i == _activeSlot ? Color.yellow                  // active (editing)
                : OutfitPresets.IsSet(i) ? Color.white
                : new Color(0.55f, 0.55f, 0.55f);                                  // empty
        }
    }

    private static bool Hit(GameObject go, Vector3 world)
    {
        if (go == null) return false;
        var rend = go.GetComponentInChildren<Renderer>();
        if (rend == null) return false;
        var b = rend.bounds;
        return world.x >= b.min.x && world.x <= b.max.x && world.y >= b.min.y && world.y <= b.max.y;
    }
}
