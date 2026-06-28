using System;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Outfit preset panel injected into Among Us's own customization screen (PlayerCustomizationMenu).
// Six slot buttons + a SAVE toggle, CLONED from the menu's native Equip button so they match the
// game's art exactly. Click a slot to wear it; click SAVE then a slot to store the current look.
// Clicks are detected in world space (no IL2CPP button-delegate marshaling).
public static class OutfitMenu
{
    private static GameObject[] _slots;
    private static GameObject _saveBtn;
    private static TextMeshPro[] _slotText;
    private static TextMeshPro _saveText;
    private static bool _saveMode;

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
    public static class ClickPatch
    {
        public static void Postfix()
        {
            try { HandleClicks(); Refresh(); }
            catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[outfit] click: " + e.Message); }
        }
    }

    private static void Build(PlayerCustomizationMenu menu)
    {
        var src = menu.equipButton;
        if (src == null) { GameWatcherPlugin.Logger?.LogWarning("[outfit] no equipButton to clone"); return; }
        _saveMode = false;
        _slots = new GameObject[OutfitPresets.SlotCount];
        _slotText = new TextMeshPro[OutfitPresets.SlotCount];

        var basePos = src.transform.localPosition;
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] equipButton local={basePos} cam={(Camera.main != null ? Camera.main.name : "null")}");

        // 3x2 grid to the left of the preview; SAVE below it. Coordinates are first-pass guesses —
        // calibrated against the logged equipButton position after a live look.
        for (int i = 0; i < OutfitPresets.SlotCount; i++)
        {
            int col = i % 3, row = i / 3;
            _slots[i] = CloneButton(src, new Vector3(-3.4f + col * 1.15f, 1.3f - row * 0.95f, basePos.z), $"{i + 1}", out _slotText[i]);
        }
        _saveBtn = CloneButton(src, new Vector3(-2.25f, -0.7f, basePos.z), "SAVE", out _saveText);
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

    private static void Refresh()
    {
        if (_slotText == null) return;
        for (int i = 0; i < _slotText.Length; i++)
        {
            if (_slotText[i] == null) continue;
            // A filled slot shows just its number; an empty one gets a trailing dot.
            _slotText[i].text = OutfitPresets.IsSet(i) ? $"{i + 1}" : $"{i + 1}·";
        }
        if (_saveText != null) _saveText.text = _saveMode ? "PICK" : "SAVE";
    }

    private static void HandleClicks()
    {
        if (_slots == null || !Input.GetMouseButtonDown(0)) return;
        var cam = Camera.main;
        if (cam == null) return;
        Vector3 m = cam.ScreenToWorldPoint(Input.mousePosition);

        if (Hit(_saveBtn, m)) { _saveMode = !_saveMode; return; }
        for (int i = 0; i < _slots.Length; i++)
        {
            if (!Hit(_slots[i], m)) continue;
            if (_saveMode) { OutfitPresets.SaveCurrent(i); _saveMode = false; }
            else OutfitPresets.Apply(i);
            return;
        }
    }

    // World-space AABB hit test against the button's sprite bounds (the game is 2D ortho).
    private static bool Hit(GameObject go, Vector3 world)
    {
        if (go == null) return false;
        var rend = go.GetComponentInChildren<Renderer>();
        if (rend == null) return false;
        var b = rend.bounds;
        return world.x >= b.min.x && world.x <= b.max.x && world.y >= b.min.y && world.y <= b.max.y;
    }
}
