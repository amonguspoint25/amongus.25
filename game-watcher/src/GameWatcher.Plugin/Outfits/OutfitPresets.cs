using System;

namespace GameWatcher.Plugin;

// A saved local-player outfit. Cosmetics only — COLOR is intentionally excluded, since AU forces
// unique colors and re-applying a saved color would collide with whoever already has it. Ids are the
// game's cosmetic string ids.
public sealed class OutfitData
{
    public string Hat = "", Skin = "", Visor = "", Pet = "", NamePlate = "";

    public bool SameAs(OutfitData o) =>
        o != null && Hat == o.Hat && Skin == o.Skin && Visor == o.Visor && Pet == o.Pet && NamePlate == o.NamePlate;
}

// 6 outfit presets, persisted in the BepInEx config. Capture the local player's current look into a
// slot, or apply a slot back onto the local player (lobby only — AU ignores cosmetic RPCs in-game).
public static class OutfitPresets
{
    public const int SlotCount = 6;
    private static readonly OutfitData?[] _slots = new OutfitData?[SlotCount];
    private static bool _loaded;

    public static OutfitData? Get(int slot)
    {
        EnsureLoaded();
        return (slot >= 0 && slot < SlotCount) ? _slots[slot] : null;
    }

    public static bool IsSet(int slot) => Get(slot) != null;

    // Save the local player's current outfit into a slot and persist it.
    public static bool SaveCurrent(int slot)
    {
        var o = Capture();
        if (o == null) return false;
        Store(slot, o);
        return true;
    }

    // Store an outfit into a slot and persist it (drives the menu's auto-save).
    public static void Store(int slot, OutfitData o)
    {
        if (slot < 0 || slot >= SlotCount || o == null) return;
        EnsureLoaded();
        _slots[slot] = o;
        var cfg = GameWatcherPlugin.Settings;
        if (cfg != null) cfg.OutfitSlots[slot].Value = Serialize(o); // ConfigFile auto-saves on set
    }

    // Apply a saved slot onto the local player via the cosmetic RPCs.
    public static bool Apply(int slot)
    {
        var o = Get(slot);
        var lp = PlayerControl.LocalPlayer;
        if (o == null || lp == null) return false;
        lp.RpcSetHat(o.Hat);
        lp.RpcSetSkin(o.Skin);
        lp.RpcSetVisor(o.Visor);
        lp.RpcSetPet(o.Pet);
        lp.RpcSetNamePlate(o.NamePlate);
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] applied slot {slot + 1}");
        return true;
    }

    public static OutfitData? Capture()
    {
        var outfit = PlayerControl.LocalPlayer?.Data?.DefaultOutfit;
        if (outfit == null) return null;
        return new OutfitData
        {
            Hat = outfit.HatId ?? "",
            Skin = outfit.SkinId ?? "",
            Visor = outfit.VisorId ?? "",
            Pet = outfit.PetId ?? "",
            NamePlate = outfit.NamePlateId ?? "",
        };
    }

    private static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        var cfg = GameWatcherPlugin.Settings;
        if (cfg == null) return;
        for (int i = 0; i < SlotCount; i++) _slots[i] = Parse(cfg.OutfitSlots[i].Value);
    }

    private static string Serialize(OutfitData o) =>
        $"{o.Hat}|{o.Skin}|{o.Visor}|{o.Pet}|{o.NamePlate}";

    private static OutfitData? Parse(string s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var p = s.Split('|');
        int o = (p.Length >= 6 && int.TryParse(p[0], out _)) ? 1 : 0; // tolerate the old color-prefixed format
        if (p.Length - o < 5) return null;
        return new OutfitData { Hat = p[o], Skin = p[o + 1], Visor = p[o + 2], Pet = p[o + 3], NamePlate = p[o + 4] };
    }
}
