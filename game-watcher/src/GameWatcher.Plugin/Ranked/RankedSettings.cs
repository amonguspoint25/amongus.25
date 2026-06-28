using System;
using System.Collections.Generic;
using AmongUs.GameOptions;

namespace GameWatcher.Plugin;

// Ranked settings preset, enforced by the start gate. Returns a short reason (for chat) listing
// every off-preset thing, else null. All reads are synchronous; called on the main thread at Start.
// MUST NOT throw: it runs inside a Harmony prefix, so a read error blocks the start (safe) rather
// than crashing the game.
public static class RankedSettings
{
    private const float CrewVision = 0.25f, ImpVision = 1.75f, KillCooldown = 22.5f, PlayerSpeed = 1.25f;
    private const int Common = 2, Long = 3, Short = 5;     // "max tasks" for this AU build
    private const int NumImpostors = 2;
    private const int KillDistShort = 0;                   // no public enum: 0 short / 1 medium / 2 long
    private const int EmergMeetings = 1, EmergCooldown = 20, DiscussionTime = 0, VotingTime = 150;
    // Tie these to the game enums so a future AU renumber can't silently mismatch the literal.
    private static readonly int TaskBarNever = (int)TaskBarMode.Invisible;
    private static readonly byte MapPolus = (byte)MapNames.Polus;

    public static string Check(int linkedCount)
    {
        int minPlayers = GameWatcherPlugin.Settings != null ? GameWatcherPlugin.Settings.MinLinkedPlayers.Value : 10;
        var bad = new List<string>();
        void Req(bool ok, string label) { if (!ok) bad.Add(label); }

        if (linkedCount < minPlayers) bad.Add($"need {minPlayers} linked (have {linkedCount})");

        try
        {
            var go = GameOptionsManager.Instance?.CurrentGameOptions;
            if (go == null)
            {
                bad.Add("game options not loaded"); // never pass the preset unverified
            }
            else
            {
                Req(go.GameMode == GameModes.Normal, "classic mode"); // not Hide n Seek
                Req(Near(go.GetFloat(FloatOptionNames.CrewLightMod), CrewVision), "crew vis .25");
                Req(Near(go.GetFloat(FloatOptionNames.ImpostorLightMod), ImpVision), "imp vis 1.75");
                Req(Near(go.GetFloat(FloatOptionNames.KillCooldown), KillCooldown), "kill cd 22.5");
                Req(Near(go.GetFloat(FloatOptionNames.PlayerSpeedMod), PlayerSpeed), "speed 1.25");

                Req(go.GetInt(Int32OptionNames.NumImpostors) == NumImpostors, "2 imps");
                Req(go.GetByte(ByteOptionNames.MapId) == MapPolus, "Polus");
                Req(go.GetInt(Int32OptionNames.KillDistance) == KillDistShort, "short kill dist");
                Req(go.GetInt(Int32OptionNames.NumEmergencyMeetings) == EmergMeetings, "1 emrg mtg");
                Req(go.GetInt(Int32OptionNames.EmergencyCooldown) == EmergCooldown, "emrg cd 20");
                Req(go.GetInt(Int32OptionNames.DiscussionTime) == DiscussionTime, "disc 0");
                Req(go.GetInt(Int32OptionNames.VotingTime) == VotingTime, "vote 150");
                Req(go.GetInt(Int32OptionNames.NumCommonTasks) == Common &&
                    go.GetInt(Int32OptionNames.NumLongTasks) == Long &&
                    go.GetInt(Int32OptionNames.NumShortTasks) == Short, "max tasks 2/3/5");
                Req(go.GetInt(Int32OptionNames.TaskBarMode) == TaskBarNever, "task bar Never");

                Req(!go.GetBool(BoolOptionNames.VisualTasks), "visual off");
                Req(!go.GetBool(BoolOptionNames.AnonymousVotes), "anon votes off");
                Req(!go.GetBool(BoolOptionNames.ConfirmImpostor), "confirm ejects off");

                bool anyRole = false;
                foreach (var r in new[] { RoleTypes.Engineer, RoleTypes.Scientist, RoleTypes.GuardianAngel,
                                          RoleTypes.Shapeshifter, RoleTypes.Noisemaker, RoleTypes.Phantom, RoleTypes.Tracker })
                    if (go.RoleOptions.GetChancePerGame(r) > 0 || go.RoleOptions.GetNumPerGame(r) > 0) { anyRole = true; break; }
                Req(!anyRole, "roles off");

                GameWatcherPlugin.Logger?.LogInfo(
                    $"[settings] map={go.GetByte(ByteOptionNames.MapId)} imps={go.GetInt(Int32OptionNames.NumImpostors)} " +
                    $"crewV={go.GetFloat(FloatOptionNames.CrewLightMod)} impV={go.GetFloat(FloatOptionNames.ImpostorLightMod)} " +
                    $"killCd={go.GetFloat(FloatOptionNames.KillCooldown)} speed={go.GetFloat(FloatOptionNames.PlayerSpeedMod)} " +
                    $"killDist={go.GetInt(Int32OptionNames.KillDistance)} emrg={go.GetInt(Int32OptionNames.NumEmergencyMeetings)}/{go.GetInt(Int32OptionNames.EmergencyCooldown)} " +
                    $"disc={go.GetInt(Int32OptionNames.DiscussionTime)} vote={go.GetInt(Int32OptionNames.VotingTime)} " +
                    $"tasks={go.GetInt(Int32OptionNames.NumCommonTasks)}/{go.GetInt(Int32OptionNames.NumLongTasks)}/{go.GetInt(Int32OptionNames.NumShortTasks)} " +
                    $"taskbar={go.GetInt(Int32OptionNames.TaskBarMode)} visual={go.GetBool(BoolOptionNames.VisualTasks)} anon={go.GetBool(BoolOptionNames.AnonymousVotes)} confirm={go.GetBool(BoolOptionNames.ConfirmImpostor)}");
            }
        }
        catch (Exception e)
        {
            GameWatcherPlugin.Logger?.LogWarning("[settings] check failed: " + e.Message);
            bad.Add("settings read error"); // block rather than crash the game
        }

        return bad.Count == 0 ? null : string.Join(", ", bad);
    }

    private static bool Near(float a, float b) => Math.Abs(a - b) < 0.01f;
}
