using System;
using Il2CppInterop.Runtime.InteropTypes.Arrays;
using UnityEngine;

namespace GameWatcher.Plugin;

// Procedural box-outline sprite for the outfit slots — no external/Higgsfield assets. A transparent
// square with a solid white border ring; the SpriteRenderer tints it per state (gold = selected,
// white = saved, dim = empty). Created once, at 1 world unit (pixelsPerUnit = size).
public static class OutfitAssets
{
    private static Sprite _outline;

    public static Sprite Outline => _outline != null ? _outline : (_outline = BuildOutline());

    private static Sprite BuildOutline()
    {
        try
        {
            const int size = 128, border = 10;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
            };
            var px = new Color32[size * size];
            var clear = new Color32(0, 0, 0, 0);
            var line = new Color32(255, 255, 255, 255);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                    px[y * size + x] = (x < border || x >= size - border || y < border || y >= size - border) ? line : clear;

            tex.SetPixels32((Il2CppStructArray<Color32>)px);
            tex.Apply(false);
            GameWatcherPlugin.Logger?.LogInfo("[outfit] outline texture built");
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), size);
        }
        catch (Exception e)
        {
            GameWatcherPlugin.Logger?.LogWarning("[outfit] outline build failed: " + e.Message);
            return null;
        }
    }
}
