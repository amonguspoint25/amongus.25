using System;
using System.Collections.Generic;
using AmongUs.GameOptions;

namespace GameWatcher.Plugin;

// Ranked settings preset, enforced by the start gate. Returns a short reason (for chat) listing
// every off-preset thing, else null. All reads are synchronous; called on the main thread at Start.
public static class RankedSettings
{
    public const int MinLinkedPlayers = 10;
    private const float CrewVision = 0.25f;
    private const float ImpVision = 1.75f;

    public static string Check(int linkedCount)
    {
        var bad = new List<string>();
        if (linkedCount < MinLinkedPlayers) bad.Add($"need {MinLinkedPlayers} linked (have {linkedCount})");

        var go = GameOptionsManager.Instance?.CurrentGameOptions;
        if (go != null)
        {
            if (!Near(go.GetFloat(FloatOptionNames.CrewLightMod), CrewVision)) bad.Add("crew vision 0.25");
            if (!Near(go.GetFloat(FloatOptionNames.ImpostorLightMod), ImpVision)) bad.Add("imp vision 1.75");

            bool anyRole = false;
            foreach (var r in new[] { RoleTypes.Engineer, RoleTypes.Scientist, RoleTypes.GuardianAngel,
                                      RoleTypes.Shapeshifter, RoleTypes.Noisemaker, RoleTypes.Phantom, RoleTypes.Tracker })
                if (go.RoleOptions.GetChancePerGame(r) > 0 || go.RoleOptions.GetNumPerGame(r) > 0) { anyRole = true; break; }
            if (anyRole) bad.Add("roles off");

            // Log task counts so "max tasks" + "task bar Never" can be locked to this version's real
            // values next (those accessors differ across AU builds).
            GameWatcherPlugin.Logger?.LogInfo(
                $"[settings] crewV={go.GetFloat(FloatOptionNames.CrewLightMod)} impV={go.GetFloat(FloatOptionNames.ImpostorLightMod)} " +
                $"tasks(C/L/S)={go.GetInt(Int32OptionNames.NumCommonTasks)}/{go.GetInt(Int32OptionNames.NumLongTasks)}/{go.GetInt(Int32OptionNames.NumShortTasks)}");
        }

        return bad.Count == 0 ? null : string.Join(", ", bad);
    }

    private static bool Near(float a, float b) => Math.Abs(a - b) < 0.01f;
}
