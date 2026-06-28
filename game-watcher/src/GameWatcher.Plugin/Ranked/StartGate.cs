using System;
using System.Collections.Generic;
using GameWatcher.Core;
using HarmonyLib;
using UnityEngine;

namespace GameWatcher.Plugin;

// Pre-start gate (spec §9). While in the lobby we snapshot every player's friend code on the main
// thread (throttled) and BrainHost resolves it against /api/lobby/roster on a background thread.
// When the host presses Start, BeginGame is cancelled unless: everyone is linked, there are >=10
// linked players, and the lobby is on the ranked settings preset.
public static class StartGate
{
    private static float _nextCheck;

    [HarmonyPatch(typeof(GameStartManager), nameof(GameStartManager.Update))]
    public static class LobbyRosterSnapshot
    {
        public static void Postfix()
        {
          try
          {
            var host = GameWatcherPlugin.Host;
            if (host == null || !host.RankedActive) return;

            // Send any pending "you're not linked" notice raised by the background resolve (main-thread chat).
            var notice = host.TakePendingAnnounce();
            if (notice != null)
            {
                var lp = PlayerControl.LocalPlayer;
                if (lp != null) lp.RpcSendChat(notice);
            }

            if (Time.realtimeSinceStartup < _nextCheck) return;
            _nextCheck = Time.realtimeSinceStartup + 3f;

            var client = AmongUsClient.Instance;
            if (client == null) return;

            var players = new List<RosterPlayer>();
            var names = new Dictionary<int, string>();
            var clients = client.allClients;
            for (int i = 0; i < clients.Count; i++)
            {
                var cd = clients[i];
                if (cd == null) continue;
                var pc = cd.Character;
                if (pc == null) continue;
                int id = pc.PlayerId;
                string name = pc.Data != null ? pc.Data.PlayerName : (cd.PlayerName ?? string.Empty);
                string fc = cd.FriendCode ?? string.Empty;
                players.Add(new RosterPlayer(id, fc, null, name));
                names[id] = name;
            }
            if (players.Count == 0) return;
            host.CheckRoster(players, names);
          }
          catch (Exception e) { GameWatcherPlugin.Logger?.LogWarning("[gate] snapshot: " + e.Message); }
        }
    }

    [HarmonyPatch(typeof(GameStartManager), nameof(GameStartManager.BeginGame))]
    public static class BeginGameGate
    {
        public static bool Prefix()
        {
            var host = GameWatcherPlugin.Host;
            if (host == null || !host.RankedActive) return true; // not ranked-active -> normal start

            try
            {
                // Snapshot the verdict once — a background thread can change it between reads.
                int verdict = host.Verdict;
                if (verdict != 1)
                {
                    Block(verdict == 2
                        ? "Ranked blocked - not linked: " + host.BlockedNames
                        : "Ranked: checking links, press Start again");
                    return false;
                }

                // Min linked players + settings preset (synchronous reads).
                var reason = RankedSettings.Check(CountLinked());
                if (reason != null) { Block("Ranked blocked - " + reason); return false; }

                return true; // all good -> start
            }
            catch (Exception e)
            {
                // Fail safe: a Harmony prefix must never crash the game. Block the start, don't throw.
                GameWatcherPlugin.Logger?.LogWarning("[gate] prefix failed: " + e.Message);
                try { Block("Ranked: error checking lobby, try again"); } catch { }
                return false;
            }
        }

        private static int CountLinked()
        {
            var host = GameWatcherPlugin.Host;
            var client = AmongUsClient.Instance;
            if (host == null || client == null) return 0;
            int n = 0;
            var clients = client.allClients;
            for (int i = 0; i < clients.Count; i++)
            {
                var pc = clients[i]?.Character;
                if (pc != null && host.IsLinked(pc.PlayerId.ToString())) n++;
            }
            return n;
        }

        // Cancel the start and tell the lobby why (kept under AU's ~100-char chat limit).
        private static void Block(string msg)
        {
            if (msg.Length > 90) msg = msg.Substring(0, 88) + "..";
            var local = PlayerControl.LocalPlayer;
            if (local != null) local.RpcSendChat(msg);
            GameWatcherPlugin.Logger?.LogInfo("[gate] blocked start: " + msg);
        }
    }
}
