using System;
using AmongUs.GameOptions;
using TMPro;
using UnityEngine;

namespace GameWatcher.Plugin;

// Drives the pure Core RankedTimer: TimerMinutes of ACTIVE play, paused during meetings. Modded
// players get an on-screen HUD countdown; everyone (incl. unmodded) sees the remaining time in chat
// at each meeting. On expiry, if the crew hasn't finished tasks (and impostors are still alive, else
// the game would already have ended), the host force-ends as an impostor win.
public static class RankedTimerController
{
    private static readonly GameWatcher.Core.RankedTimer _timer = new();
    private static bool _active;
    private static bool _ended;
    private static float _lastTick;
    private static TextMeshPro _hud;

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
        Announce(); // chat is visible at meetings -> unmodded players see the remaining task time here
    }

    public static void OnMeetingEnd()
    {
        if (!_active) return;
        _timer.Resume();
        _lastTick = Time.realtimeSinceStartup;
    }

    // Pumped every frame. Updates the HUD always; only counts down while running (paused in meetings).
    public static void Tick()
    {
        UpdateHud();
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
        var client = AmongUsClient.Instance;
        if (client == null || !client.AmHost)
        {
            GameWatcherPlugin.Logger?.LogInfo("[timer] expired (not host - no force)");
            return;
        }
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
        if (l != null) l.RpcSendChat($"Task timer: {s / 60}:{(s % 60):00} left (0 = impostor win)");
    }

    // On-screen countdown for anyone running the mod. Shown only during active play (hidden in the
    // lobby and during meetings). Cloned from the task list text so it inherits the game's font.
    private static void UpdateHud()
    {
        var hm = HudManager.Instance;
        if (hm == null) return;
        bool show = _active && ShipStatus.Instance != null && MeetingHud.Instance == null;
        if (!show) { if (_hud != null) _hud.gameObject.SetActive(false); return; }
        try
        {
            if (_hud == null)
            {
                _hud = UnityEngine.Object.Instantiate(hm.TaskPanel.taskText, hm.transform);
                _hud.gameObject.name = "RankedTimerHud";
                _hud.transform.localPosition = new Vector3(0f, 2.5f, -10f);
                _hud.alignment = TextAlignmentOptions.Center;
                _hud.fontSize = 3.5f;
                _hud.fontSizeMax = 3.5f;
                _hud.enableWordWrapping = false;
            }
            long s = _timer.RemainingMs / 1000;
            _hud.gameObject.SetActive(true);
            _hud.text = $"Tasks {s / 60}:{(s % 60):00}";
            _hud.color = s <= 120 ? Color.red : Color.white; // last 2 min -> red
        }
        catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[timer] hud: " + e.Message); }
    }
}
