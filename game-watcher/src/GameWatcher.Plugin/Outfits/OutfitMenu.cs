using System;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// In-lobby outfit menu: a column of 6 slot labels + a SAVE toggle. Click a slot to wear it; click
// SAVE then a slot to store your current look there. Shown only in the lobby. Click detection maps
// the mouse to world space and hit-tests each label's bounds (no IL2CPP button-delegate wiring).
public static class OutfitMenu
{
    private static GameObject _root;
    private static TextMeshPro[] _slots;
    private static TextMeshPro _saveBtn;
    private static bool _saveMode;

    public static void Update()
    {
        var hm = HudManager.Instance;
        bool inLobby = hm != null && LobbyBehaviour.Instance != null;
        if (!inLobby) { if (_root != null) _root.SetActive(false); return; }
        try
        {
            EnsureBuilt(hm);
            _root.SetActive(true);
            HandleClicks();
            Refresh();
        }
        catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[outfit] menu: " + e.Message); }
    }

    private static void EnsureBuilt(HudManager hm)
    {
        if (_root != null) return;
        _root = new GameObject("OutfitMenu");
        _root.transform.SetParent(hm.transform, false);

        Label(hm, "OUTFITS", new Vector3(-4.2f, 1.9f, -10f), 2.3f); // title
        _slots = new TextMeshPro[OutfitPresets.SlotCount];
        for (int i = 0; i < _slots.Length; i++)
            _slots[i] = Label(hm, "", new Vector3(-4.2f, 1.35f - i * 0.45f, -10f), 2.0f);
        _saveBtn = Label(hm, "[ SAVE ]", new Vector3(-4.2f, 1.35f - _slots.Length * 0.45f - 0.1f, -10f), 2.0f);
        GameWatcherPlugin.Logger?.LogInfo("[outfit] menu built");
    }

    private static TextMeshPro Label(HudManager hm, string text, Vector3 local, float size)
    {
        var t = UnityEngine.Object.Instantiate(hm.TaskPanel.taskText, _root.transform);
        t.gameObject.name = "OutfitLabel";
        t.transform.localPosition = local;
        t.alignment = TextAlignmentOptions.Left;
        t.fontSize = size;
        t.fontSizeMax = size;
        t.fontSizeMin = size;
        t.enableWordWrapping = false;
        t.text = text;
        return t;
    }

    private static void Refresh()
    {
        for (int i = 0; i < _slots.Length; i++)
        {
            bool set = OutfitPresets.IsSet(i);
            _slots[i].text = $"[{i + 1}] {(set ? "wear" : "empty")}";
            _slots[i].color = set ? Color.white : new Color(0.55f, 0.55f, 0.55f);
        }
        _saveBtn.text = _saveMode ? "[ SAVE: pick a slot ]" : "[ SAVE ]";
        _saveBtn.color = _saveMode ? Color.yellow : Color.white;
    }

    private static void HandleClicks()
    {
        if (!Input.GetMouseButtonDown(0)) return;
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

    // World-space AABB hit test (the game is 2D ortho), padded so small text is easy to click.
    private static bool Hit(TextMeshPro label, Vector3 world)
    {
        var rend = label.GetComponent<Renderer>();
        if (rend == null) return false;
        var b = rend.bounds;
        const float pad = 0.18f;
        return world.x >= b.min.x - pad && world.x <= b.max.x + pad &&
               world.y >= b.min.y - pad && world.y <= b.max.y + pad;
    }
}
