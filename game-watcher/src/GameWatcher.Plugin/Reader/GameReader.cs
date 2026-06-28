using System;
using System.Collections.Generic;
using AmongUs.GameOptions;
using GameWatcher.Core.Domain;
using HarmonyLib;
using Il2CppInterop.Runtime.InteropTypes.Arrays;

namespace GameWatcher.Plugin;

// Real game reader: Harmony hooks translate live Among Us events into Core event records, enqueued to
// BrainHost for recording. Also drives the ranked timer lifecycle. All reads are main-thread; only
// plain records cross to the background worker (never Il2Cpp objects).
public static class GameReader
{
    private static DateTimeOffset _start;
    private static bool _recording;
    private static string _code;
    private static int _seq;  // monotonic suffix so two games can never collide on the same match code

    private static long AtMs() => (long)(DateTimeOffset.UtcNow - _start).TotalMilliseconds;
    private static bool Active => GameWatcherPlugin.Host != null && GameWatcherPlugin.Host.RankedActive;
    private static void Emit(GameEvent e) => GameWatcherPlugin.Host?.Enqueue(e);

    // Entering a lobby resets stale state from a game that ended without a clean finish (host left,
    // disbanded mid-round) so a half-recorded game can't leak into the next one or leave the timer running.
    [HarmonyPatch(typeof(LobbyBehaviour), nameof(LobbyBehaviour.Start))]
    public static class LobbyReset
    {
        public static void Postfix()
        {
            if (_recording) GameWatcherPlugin.Logger?.LogInfo("[reader] back in lobby - reset stale game state");
            _recording = false;
            RankedTimerController.OnGameEnd();
        }
    }

    // GAME START: roster + roles + per-crew task counts. IntroCutscene.OnDestroy fires once the
    // role-reveal ends, by which point roles are assigned and players are spawned.
    [HarmonyPatch(typeof(IntroCutscene), nameof(IntroCutscene.OnDestroy))]
    public static class Start
    {
        public static void Postfix()
        {
            _recording = Active;
            if (!_recording) return;
            _start = DateTimeOffset.UtcNow;
            _code = MatchCode();

            var all = PlayerControl.AllPlayerControls;
            var roster = new List<RosterEntry>();
            for (int i = 0; i < all.Count; i++)
            {
                var pc = all[i];
                if (pc == null || pc.Data == null) continue;
                bool imp = pc.Data.Role != null && pc.Data.Role.IsImpostor;
                roster.Add(new RosterEntry(pc.PlayerId.ToString(), pc.Data.PlayerName, imp ? Role.IMPOSTOR : Role.CREW));
            }
            Emit(new GameStarted(_code, MapName(), _start, roster));
            for (int i = 0; i < all.Count; i++)
            {
                var pc = all[i];
                if (pc == null || pc.Data == null || pc.Data.Role == null || pc.Data.Role.IsImpostor) continue;
                int tasks = pc.Data.Tasks != null ? pc.Data.Tasks.Count : 0;
                Emit(new TasksAssigned(pc.PlayerId.ToString(), tasks));
            }
            RankedTimerController.OnGameStart();
            GameWatcherPlugin.Logger?.LogInfo($"[reader] start {_code}: {roster.Count} players");
        }
    }

    // KILL: __instance is the killer, target is the victim.
    [HarmonyPatch(typeof(PlayerControl), nameof(PlayerControl.MurderPlayer))]
    public static class Kill
    {
        public static void Postfix(PlayerControl __instance, PlayerControl target)
        {
            if (!_recording || __instance == null || target == null) return;
            Emit(new PlayerKilled(__instance.PlayerId.ToString(), target.PlayerId.ToString(), AtMs()));
        }
    }

    // MEETING START: pause the task timer.
    [HarmonyPatch(typeof(MeetingHud), nameof(MeetingHud.Start))]
    public static class MeetingStart
    {
        public static void Postfix() { if (_recording) RankedTimerController.OnMeetingStart(); }
    }

    // MEETING END: who was ejected + every real vote; resume the timer.
    [HarmonyPatch(typeof(MeetingHud), nameof(MeetingHud.VotingComplete))]
    public static class MeetingEnd
    {
        public static void Postfix(Il2CppStructArray<MeetingHud.VoterState> states, NetworkedPlayerInfo exiled, bool tie)
        {
            if (!_recording) return;
            string ejected = exiled != null ? exiled.PlayerId.ToString() : null;
            var votes = new List<VoteCast>();
            if (states != null)
                for (int i = 0; i < states.Length; i++)
                {
                    int voter = states[i].VoterId;
                    int votedFor = states[i].VotedForId;         // special values (253 skip, 254 none) are >= 250
                    if (voter >= 0 && voter < 250 && votedFor >= 0 && votedFor < 250 && PlayerById((byte)votedFor) != null)
                        votes.Add(new VoteCast(voter.ToString(), votedFor.ToString()));
                }
            Emit(new MeetingEnded(ejected, votes));
            RankedTimerController.OnMeetingEnd();
            GameWatcherPlugin.Logger?.LogInfo($"[reader] meeting: ejected={ejected ?? "none"} votes={votes.Count}");
        }
    }

    // GAME END: synthesize per-player task completions from the final task state, then the outcome.
    [HarmonyPatch(typeof(AmongUsClient), nameof(AmongUsClient.OnGameEnd))]
    public static class End
    {
        public static void Postfix(EndGameResult endGameResult)
        {
            RankedTimerController.OnGameEnd();
            if (!_recording) return;
            _recording = false;

            var all = PlayerControl.AllPlayerControls;
            for (int i = 0; i < all.Count; i++)
            {
                var pc = all[i];
                if (pc == null || pc.Data == null) continue;
                if (pc.Data.Disconnected) Emit(new PlayerLeft(pc.PlayerId.ToString())); // nullifies their ELO
                var tasks = pc.Data.Tasks;
                if (tasks == null) continue;
                for (int t = 0; t < tasks.Count; t++)
                    if (tasks[t] != null && tasks[t].Complete)
                        Emit(new TaskCompleted(pc.PlayerId.ToString(), AtMs()));
            }

            var reason = endGameResult != null ? endGameResult.GameOverReason : default;
            var outcome = MapOutcome(reason);
            Emit(new GameEnded(outcome, DateTimeOffset.UtcNow));
            GameWatcherPlugin.Logger?.LogInfo($"[reader] end {_code}: reason={reason} -> {outcome}");
        }
    }

    private static PlayerControl PlayerById(byte id)
    {
        var all = PlayerControl.AllPlayerControls;
        for (int i = 0; i < all.Count; i++)
            if (all[i] != null && all[i].PlayerId == id) return all[i];
        return null;
    }

    // Disconnect reasons name WHO LEFT, not who won: an impostor leaving = crew win, and vice versa.
    private static Outcome MapOutcome(GameOverReason reason)
    {
        string s = reason.ToString();
        if (s == "ImpostorDisconnect") return Outcome.CREW_WIN;
        if (s == "HumansDisconnect") return Outcome.IMP_WIN;
        return s.StartsWith("Humans") ? Outcome.CREW_WIN : Outcome.IMP_WIN;
    }

    private static string MapName()
    {
        try
        {
            byte m = GameOptionsManager.Instance.CurrentGameOptions.GetByte(ByteOptionNames.MapId);
            return m switch
            {
                0 => "The Skeld",
                1 => "Mira HQ",
                2 => "Polus",
                4 => "The Airship",
                5 => "The Fungle",
                _ => "Map " + m,
            };
        }
        catch { return "Unknown"; }
    }

    private static string MatchCode()
    {
        int g = 0;
        try { g = AmongUsClient.Instance.GameId; } catch { }
        // ms precision + a per-session sequence so a GameId=0 fallback (or two games in one second)
        // can never produce a duplicate code that the dedup queue would silently drop.
        return $"AU-{g}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{++_seq}";
    }
}
