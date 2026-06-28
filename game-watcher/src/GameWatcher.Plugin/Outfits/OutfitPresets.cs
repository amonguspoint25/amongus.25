using System;

namespace GameWatcher.Plugin;

// A saved local-player outfit (color + cosmetics). Cosmetic ids are the game's string ids.
public sealed class OutfitData
{
    public int Color;
    public string Hat = "", Skin = "", Visor = "", Pet = "", NamePlate = "";
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
        if (slot < 0 || slot >= SlotCount) return false;
        var o = Capture();
        if (o == null) return false;
        EnsureLoaded();
        _slots[slot] = o;
        var cfg = GameWatcherPlugin.Settings;
        if (cfg != null) cfg.OutfitSlots[slot].Value = Serialize(o); // ConfigFile auto-saves on set
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] saved slot {slot + 1}");
        return true;
    }

    // Apply a saved slot onto the local player via the cosmetic RPCs.
    public static bool Apply(int slot)
    {
        var o = Get(slot);
        var lp = PlayerControl.LocalPlayer;
        if (o == null || lp == null) return false;
        lp.RpcSetColor((byte)o.Color);
        lp.RpcSetHat(o.Hat);
        lp.RpcSetSkin(o.Skin);
        lp.RpcSetVisor(o.Visor);
        lp.RpcSetPet(o.Pet);
        lp.RpcSetNamePlate(o.NamePlate);
        GameWatcherPlugin.Logger?.LogInfo($"[outfit] applied slot {slot + 1}");
        return true;
    }

    private static OutfitData? Capture()
    {
        var outfit = PlayerControl.LocalPlayer?.Data?.DefaultOutfit;
        if (outfit == null) return null;
        return new OutfitData
        {
            Color = outfit.ColorId,
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
        $"{o.Color}|{o.Hat}|{o.Skin}|{o.Visor}|{o.Pet}|{o.NamePlate}";

    private static OutfitData? Parse(string s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var p = s.Split('|');
        if (p.Length < 6 || !int.TryParse(p[0], out var color)) return null;
        return new OutfitData { Color = color, Hat = p[1], Skin = p[2], Visor = p[3], Pet = p[4], NamePlate = p[5] };
    }
}
