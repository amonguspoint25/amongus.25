using System;
using AmongUs.GameOptions;
using UnityEngine;

namespace GameWatcher.Plugin;

// Drives the pure Core RankedTimer: TimerMinutes of ACTIVE play, paused during meetings. On expiry,
// if the crew hasn't finished all tasks, the host force-ends the game as an impostor win. The reader
// calls the lifecycle hooks; Tick is pumped every frame by HudManager.Update.
public static class RankedTimerController
{
    private static readonly GameWatcher.Core.RankedTimer _timer = new();
    private static bool _active;
    private static bool _ended;
    private static float _lastTick;

    public static long RemainingMs => _timer.RemainingMs;
    public static bool Running => _active;

    public static void OnGameStart()
    {
        int mins = GameWatcherPlugin.Settings != null ? GameWatcherPlugin.Settings.TimerMinutes.Value : 18;
        _timer.Reset(mins * 60_000L);
        _active = true;
        _ended = false;
        _lastTick = Time.realtimeSinceStartup;
        GameWatcherPlugin.Logger?.LogInfo($"[timer] started: {mins} min");
    }

    public static void OnGameEnd() => _active = false;

    public static void OnMeetingStart()
    {
        if (!_active) return;
        _timer.Pause();
        Announce(); // chat is visible at meetings -> tell everyone the remaining task time
    }

    public static void OnMeetingEnd()
    {
        if (!_active) return;
        _timer.Resume();
        _lastTick = Time.realtimeSinceStartup;
    }

    // Pumped every frame. Only counts while running (paused during meetings).
    public static void Tick()
    {
        if (!_active || _ended) return;
        float now = Time.realtimeSinceStartup;
        long dms = (long)((now - _lastTick) * 1000f);
        _lastTick = now;
        if (dms > 0 && _timer.Tick(dms)) ForceEnd();
    }

    private static void ForceEnd()
    {
        _ended = true;
        _active = false;
        var gd = GameData.Instance;
        bool tasksDone = gd != null && gd.TotalTasks > 0 && gd.CompletedTasks >= gd.TotalTasks;
        if (tasksDone) { GameWatcherPlugin.Logger?.LogInfo("[timer] expired but tasks complete - no force"); return; }
        try
        {
            GameManager.Instance?.RpcEndGame(GameOverReason.ImpostorsByKill, false);
            GameWatcherPlugin.Logger?.LogInfo("[timer] expired -> force impostor win");
        }
        catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[timer] force-end failed: " + e.Message); }
    }

    private static void Announce()
    {
        long s = _timer.RemainingMs / 1000;
        var l = PlayerControl.LocalPlayer;
        if (l != null) l.RpcSendChat($"Task time: {s / 60}:{(s % 60):00} left");
    }
}
