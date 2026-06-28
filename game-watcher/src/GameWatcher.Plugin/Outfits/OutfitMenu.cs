using System;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Outfit preset panel injected into Among Us's customization screen (PlayerCustomizationMenu). Six
// slot buttons cloned from the menu's native Equip button, with a header + subtitle cloned from the
// menu's item-name label. Click a slot to WEAR it + make it active (shows "SELECTED"); while a slot
// is active, any cosmetic change you equip auto-saves into it. No save button.
public static class OutfitMenu
{
    private static readonly Color Gold = new Color(1f, 0.82f, 0.25f);
    private static readonly Color Dim = new Color(0.5f, 0.5f, 0.55f);

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

        var parent = src.transform.parent;
        var z = src.transform.localPosition.z;
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] equipButton local={src.transform.localPosition} cam={(Camera.main != null ? Camera.main.name : "null")}");

        // Header + subtitle, cloned from the menu's native item-name label so the font matches.
        if (menu.itemName != null)
        {
            Label(menu.itemName, parent, new Vector3(-2.25f, 2.15f, z), "OUTFIT PRESETS", 2.6f, Color.white);
            Label(menu.itemName, parent, new Vector3(-2.25f, -0.35f, z), "click to wear · edits auto-save", 1.4f, Dim);
        }

        // 3x2 grid of slot buttons. Coordinates are first-pass guesses, calibrated against the log later.
        for (int i = 0; i < OutfitPresets.SlotCount; i++)
        {
            int col = i % 3, row = i / 3;
            _slots[i] = CloneButton(src, new Vector3(-3.4f + col * 1.15f, 1.45f - row * 0.95f, z), out _slotText[i]);
        }
        Refresh();
        GameWatcherPlugin.Logger?.LogInfo("[outfit] panel built in customization menu");
    }

    private static GameObject CloneButton(GameObject src, Vector3 local, out TextMeshPro txt)
    {
        var go = UnityEngine.Object.Instantiate(src, src.transform.parent);
        go.name = "OutfitSlot";
        go.transform.localPosition = local;
        go.transform.localScale = src.transform.localScale * 0.66f;
        go.SetActive(true);
        var pb = go.GetComponent<PassiveButton>();
        txt = pb != null && pb.buttonText != null ? pb.buttonText : go.GetComponentInChildren<TextMeshPro>();
        if (txt != null) { txt.enableAutoSizing = true; txt.enableWordWrapping = false; } // so "SELECTED" fits
        return go;
    }

    private static TextMeshPro Label(TextMeshPro src, Transform parent, Vector3 local, string text, float size, Color color)
    {
        var t = UnityEngine.Object.Instantiate(src, parent);
        t.name = "OutfitLabel";
        t.transform.localPosition = local;
        t.alignment = TextAlignmentOptions.Center;
        t.enableAutoSizing = false;
        t.fontSize = size;
        t.enableWordWrapping = false;
        t.text = text;
        t.color = color;
        t.gameObject.SetActive(true);
        return t;
    }

    // Selecting a slot wears it (or, if empty, captures your current look) and makes it active.
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
            if (i == _activeSlot)
            {
                _slotText[i].text = "SELECTED";
                _slotText[i].color = Gold;
            }
            else if (OutfitPresets.IsSet(i))
            {
                _slotText[i].text = $"OUTFIT {i + 1}";
                _slotText[i].color = Color.white;
            }
            else
            {
                _slotText[i].text = $"EMPTY {i + 1}";
                _slotText[i].color = Dim;
            }
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
