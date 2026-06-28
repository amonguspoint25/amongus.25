using System.Collections.Generic;
using GameWatcher.Core;
using HarmonyLib;
using UnityEngine;

namespace GameWatcher.Plugin;

// Pre-start link gate (spec §9). While in the lobby we snapshot every player's friend code on the
// main thread (throttled), and BrainHost resolves it against /api/lobby/roster on a background
// thread. When the host presses Start, BeginGame is cancelled if anyone isn't linked.
public static class StartGate
{
    private static float _nextCheck;

    [HarmonyPatch(typeof(GameStartManager), nameof(GameStartManager.Update))]
    public static class LobbyRosterSnapshot
    {
        public static void Postfix()
        {
            var host = GameWatcherPlugin.Host;
            if (host == null || !host.RankedActive) return;

            // Send any pending "you're not linked" notice raised by the background resolve.
            // RpcSendChat must run on the main thread, which is here.
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
                // puid is optional (the server auto-captures it); skip until the exact field name is confirmed.
                players.Add(new RosterPlayer(id, fc, null, name));
                names[id] = name;
            }
            if (players.Count == 0) return;
            host.CheckRoster(players, names);
        }
    }

    [HarmonyPatch(typeof(GameStartManager), nameof(GameStartManager.BeginGame))]
    public static class BeginGameGate
    {
        public static bool Prefix()
        {
            var host = GameWatcherPlugin.Host;
            if (host == null || !host.RankedActive) return true; // not ranked-active -> normal start
            if (host.Verdict == 1) return true;                  // everyone linked -> allow

            string msg = host.Verdict == 2
                ? Trunc("Ranked blocked - not linked: " + host.BlockedNames)
                : "Ranked: checking links, press Start again";
            var local = PlayerControl.LocalPlayer;
            if (local != null) local.RpcSendChat(msg);
            GameWatcherPlugin.Logger?.LogInfo("[gate] blocked start: " + msg);
            return false; // cancel the game start
        }

        // Stay under Among Us's ~100-char chat limit (over-length chat = server kick).
        private static string Trunc(string s) => s.Length <= 90 ? s : s.Substring(0, 88) + "..";
    }
}
