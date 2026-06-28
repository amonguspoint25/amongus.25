using System;
using HarmonyLib;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Outfit preset panel injected into Among Us's customization screen (PlayerCustomizationMenu).
// "0" clears all cosmetics (always blank). Slots 1-6 are sprite frames: click to WEAR + make active
// (gold "SELECTED"); while active, equipped changes auto-save in. Frames use a material lifted from a
// live menu sprite (a from-scratch SpriteRenderer renders invisible in IL2CPP without one).
public static class OutfitMenu
{
    private static readonly Color Dim = new Color(0.62f, 0.66f, 0.72f);
    private static readonly Color Navy = new Color(0.09f, 0.11f, 0.20f);
    private static readonly Color FadedFrame = new Color(1f, 1f, 1f, 0.45f);

    private static GameObject[] _slots;
    private static SpriteRenderer[] _slotSr;
    private static TextMeshPro[] _slotText;
    private static GameObject _clearBtn;
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
        var anchor = menu.equipButton;
        if (anchor == null || OutfitAssets.Normal == null) { GameWatcherPlugin.Logger?.LogWarning("[outfit] no anchor/asset"); return; }
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
        var mat = anchorSr != null ? anchorSr.sharedMaterial : null; // the working sprite material
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] anchor local={anchor.transform.localPosition} order={order} mat={(mat != null ? mat.name : "null")}");

        if (menu.itemName != null)
            MakeLabel(menu.itemName, parent, new Vector3(-2.2f, 2.45f, z), "OUTFIT PRESETS", 2.1f, Color.white, order + 2, false);

        // 3x2 grid of slot frames 1-6.
        for (int i = 0; i < n; i++)
        {
            int col = i % 3, row = i / 3;
            var pos = new Vector3(-3.35f + col * 1.15f, 1.55f - row * 0.95f, z);
            _slots[i] = MakeFrame(parent, pos, layer, order, mat, out _slotSr[i]);
            _slotText[i] = menu.itemName != null
                ? MakeLabel(menu.itemName, parent, new Vector3(pos.x, pos.y, z - 0.1f), "", 1.7f, Color.white, order + 2, true)
                : null;
        }

        // "0" = clear everything (always blank), below the grid.
        _clearBtn = MakeFrame(parent, new Vector3(-2.2f, -0.25f, z), layer, order, mat, out _);
        if (menu.itemName != null)
            MakeLabel(menu.itemName, parent, new Vector3(-2.2f, -0.25f, z - 0.1f), "0", 1.7f, Color.white, order + 2, true);
        if (menu.itemName != null)
            MakeLabel(menu.itemName, parent, new Vector3(-2.2f, -0.85f, z), "click = wear · 0 = clear", 1.25f, Dim, order + 2, false);

        Refresh();
        GameWatcherPlugin.Logger?.LogInfo("[outfit] sprite panel built");
    }

    private static GameObject MakeFrame(Transform parent, Vector3 pos, int layer, int order, Material mat, out SpriteRenderer sr)
    {
        var go = new GameObject("OutfitSlot");
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localScale = Vector3.one * 0.82f; // sprite is 1 world unit -> ~0.82 button
        sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = OutfitAssets.Normal;
        if (mat != null) sr.sharedMaterial = mat; // CRITICAL in IL2CPP — else renders invisible
        sr.sortingLayerID = layer;
        sr.sortingOrder = order;
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
        return t;
    }

    private static void HandleClicks()
    {
        if (_slots == null || !Input.GetMouseButtonDown(0)) return;
        var cam = Camera.main;
        if (cam == null) return;
        Vector3 m = cam.ScreenToWorldPoint(Input.mousePosition);

        if (Hit(_clearBtn, m)) // preset 0: strip everything, no active slot (so nothing auto-saves)
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
            if (_slotSr[i] != null)
            {
                _slotSr[i].sprite = active ? OutfitAssets.Active : OutfitAssets.Normal;
                _slotSr[i].color = active || set ? Color.white : FadedFrame;
            }
            if (_slotText[i] != null)
            {
                _slotText[i].text = active ? "SELECTED" : $"{i + 1}";
                _slotText[i].color = active ? Navy : (set ? Color.white : Dim);
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

    // Anchor frames + labels to itemName's sorting layer (the foreground the labels already render
    // on), bumped above the menu content.
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
