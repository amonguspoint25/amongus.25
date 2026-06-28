using System;
using System.Collections.Generic;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Outfit preset panel injected into Among Us's customization screen (PlayerCustomizationMenu). Slots
// are box outlines (procedural sprite, tinted per state). "0" clears all cosmetics (always blank).
// Slots 1-6: click to WEAR + make active (gold "SELECTED"); while active, equipped changes auto-save.
public static class OutfitMenu
{
    private static readonly Color Gold = new Color(1f, 0.82f, 0.25f);
    private static readonly Color Dim = new Color(0.55f, 0.60f, 0.68f);

    // Layout (local to the menu, near the Equip button). Moved right + down, smaller than before.
    private const float Scale = 0.62f, ColStep = 0.85f, RowStep = 0.85f, GridX0 = -1.7f, GridY0 = 1.0f;
    private const float GridCx = GridX0 + ColStep; // grid centre x

    private static GameObject[] _slots;
    private static SpriteRenderer[] _slotSr;
    private static TextMeshPro[] _slotText;
    private static GameObject _clearBtn;
    private static int _activeSlot = -1;
    private static OutfitData _lastOutfit;
    private static readonly List<GameObject> _created = new(); // everything we spawned, for cleanup on rebuild

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
        var anchor = menu.equipButton;
        if (anchor == null || OutfitAssets.Outline == null) { GameWatcherPlugin.Logger?.LogWarning("[outfit] no anchor/outline"); return; }
        // Destroy anything from a previous menu open so panels don't stack / duplicate click targets.
        foreach (var go in _created) if (go != null) UnityEngine.Object.Destroy(go);
        _created.Clear();
        _activeSlot = -1;
        _lastOutfit = OutfitPresets.Capture();
        int n = OutfitPresets.SlotCount;
        _slots = new GameObject[n];
        _slotSr = new SpriteRenderer[n];
        _slotText = new TextMeshPro[n];

        var parent = anchor.transform.parent;
        float z = anchor.transform.localPosition.z;
        int order = BaseOrder(menu);
        int layer = BaseLayer(menu);
        var anchorSr = anchor.GetComponentInChildren<SpriteRenderer>();
        var mat = anchorSr != null ? anchorSr.sharedMaterial : null;

        if (menu.itemName != null)
            MakeLabel(menu.itemName, parent, new Vector3(GridCx, GridY0 + 0.72f, z), "OUTFIT PRESETS", 1.7f, Color.white, order + 2, false);

        for (int i = 0; i < n; i++)
        {
            int col = i % 3, row = i / 3;
            var pos = new Vector3(GridX0 + col * ColStep, GridY0 - row * RowStep, z);
            _slots[i] = MakeFrame(parent, pos, layer, order, mat, out _slotSr[i]);
            _slotText[i] = menu.itemName != null
                ? MakeLabel(menu.itemName, parent, new Vector3(pos.x, pos.y, z - 0.1f), "", 1.3f, Color.white, order + 2, true)
                : null;
        }

        // "0" = clear everything (always blank), centred below the grid.
        var clearPos = new Vector3(GridCx, GridY0 - 2 * RowStep, z);
        _clearBtn = MakeFrame(parent, clearPos, layer, order, mat, out _);
        if (menu.itemName != null)
            MakeLabel(menu.itemName, parent, new Vector3(clearPos.x, clearPos.y, z - 0.1f), "0", 1.3f, Color.white, order + 2, true);
        if (menu.itemName != null)
            MakeLabel(menu.itemName, parent, new Vector3(GridCx, GridY0 - 2 * RowStep - 0.55f, z), "click = wear · 0 = clear", 1.1f, Dim, order + 2, false);

        Refresh();
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] panel built (order={order}, mat={(mat != null ? mat.name : "null")})");
    }

    private static GameObject MakeFrame(Transform parent, Vector3 pos, int layer, int order, Material mat, out SpriteRenderer sr)
    {
        var go = new GameObject("OutfitSlot");
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localScale = Vector3.one * Scale;
        sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = OutfitAssets.Outline;
        if (mat != null) sr.sharedMaterial = mat; // CRITICAL in IL2CPP, else invisible
        sr.sortingLayerID = layer;
        sr.sortingOrder = order;
        _created.Add(go);
        return go;
    }

    private static TextMeshPro MakeLabel(TextMeshPro src, Transform parent, Vector3 pos, string text, float size, Color color, int order, bool autoSize)
    {
        var t = UnityEngine.Object.Instantiate(src, parent);
        t.name = "OutfitLabel";
        t.transform.localPosition = pos;
        t.transform.localScale = Vector3.one;
        t.alignment = TextAlignmentOptions.Center;
        t.enableWordWrapping = false;
        t.enableAutoSizing = autoSize;
        t.fontSize = size;
        t.text = text;
        t.color = color;
        var r = t.GetComponent<Renderer>();
        if (r != null) r.sortingOrder = order;
        t.gameObject.SetActive(true);
        _created.Add(t.gameObject);
        return t;
    }

    private static void HandleClicks()
    {
        if (_slots == null || !Input.GetMouseButtonDown(0)) return;
        var cam = Camera.main;
        if (cam == null) return;
        Vector3 m = cam.ScreenToWorldPoint(Input.mousePosition);

        if (Hit(_clearBtn, m))
        {
            OutfitPresets.ApplyClear();
            _activeSlot = -1;
            _lastOutfit = OutfitPresets.Capture();
            return;
        }
        for (int i = 0; i < _slots.Length; i++)
        {
            if (!Hit(_slots[i], m)) continue;
            _activeSlot = i;
            if (OutfitPresets.IsSet(i)) OutfitPresets.Apply(i);
            else OutfitPresets.Store(i, OutfitPresets.Capture());
            _lastOutfit = OutfitPresets.Capture();
            GameWatcherPlugin.Logger?.LogInfo($"[outfit] active slot {i + 1}");
            return;
        }
    }

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
        if (_slotSr == null) return;
        for (int i = 0; i < _slotSr.Length; i++)
        {
            bool active = i == _activeSlot;
            bool set = OutfitPresets.IsSet(i);
            var tint = active ? Gold : (set ? Color.white : Dim);
            if (_slotSr[i] != null) _slotSr[i].color = tint;
            if (_slotText[i] != null)
            {
                _slotText[i].text = active ? "SELECTED" : $"{i + 1}";
                _slotText[i].color = tint;
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

    private static int BaseOrder(PlayerCustomizationMenu menu)
    {
        var r = menu.itemName != null ? menu.itemName.GetComponent<Renderer>() : null;
        return (r != null ? r.sortingOrder : 10) + 50;
    }

    private static int BaseLayer(PlayerCustomizationMenu menu)
    {
        var r = menu.itemName != null ? menu.itemName.GetComponent<Renderer>() : null;
        return r != null ? r.sortingLayerID : 0;
    }
}
