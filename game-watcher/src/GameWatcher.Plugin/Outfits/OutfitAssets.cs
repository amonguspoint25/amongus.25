using System;
using System.IO;
using Il2CppInterop.Runtime.InteropTypes.Arrays;
using UnityEngine;

namespace GameWatcher.Plugin;

// Loads the embedded outfit-slot PNGs into Unity sprites (once, lazily). The PNGs are stored as
// EmbeddedResource (LogicalName == file name) so the DLL is self-contained. Sprites are created at
// 1 world unit (pixelsPerUnit = texture width) so a ~0.8 transform scale gives a button-sized frame.
public static class OutfitAssets
{
    private static Sprite _normal, _active;

    public static Sprite Normal => _normal != null ? _normal : (_normal = Load("outfit_slot.png"));
    public static Sprite Active => _active != null ? _active : (_active = Load("outfit_slot_active.png"));

    private static Sprite Load(string name)
    {
        try
        {
            var asm = typeof(OutfitAssets).Assembly;
            using var s = asm.GetManifestResourceStream(name);
            if (s == null) { GameWatcherPlugin.Logger?.LogWarning("[outfit] asset missing: " + name); return null; }
            using var ms = new MemoryStream();
            s.CopyTo(ms);
            var bytes = ms.ToArray();

            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
            };
            ImageConversion.LoadImage(tex, (Il2CppStructArray<byte>)bytes);
            var sprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), tex.width);
            GameWatcherPlugin.Logger?.LogInfo($"[outfit] loaded {name} {tex.width}x{tex.height}");
            return sprite;
        }
        catch (Exception e)
        {
            GameWatcherPlugin.Logger?.LogWarning($"[outfit] asset load failed ({name}): {e.Message}");
            return null;
        }
    }
}
