using System;
using System.Collections.Generic;
using GameWatcher.Core.Domain;
using HarmonyLib;
using UnityEngine;

namespace GameWatcher.Plugin;

// F9 debug injector: pushes a SCRIPTED full game (using the current lobby's linked players) through
// the match pipeline to the leaderboard, so capture can be verified without a real 4+ player game.
// Only fires when ranked is active; roles are assigned so a linked player is the impostor.
[HarmonyPatch(typeof(HudManager), nameof(HudManager.Update))]
public static class DebugInjector
{
    private static int _counter;

    public static void Postfix()
    {
        RankedTimerController.Tick(); // pump the task timer every frame (no-op when not in a ranked game)

        var host = GameWatcherPlugin.Host;
        if (host == null) return;

        // Announce a match send result (from the injector or, later, a real game) — runs every frame, once.
        var result = host.TakePendingResult();
        if (result != null) Chat(result);

        if (!Input.GetKeyDown(KeyCode.F9)) return;
        if (!host.RankedActive) { Chat("F9: ranked not active (/ranked on + valid key)"); return; }

        var client = AmongUsClient.Instance;
        if (client == null) return;

        // Gather lobby players; pick a LINKED player as impostor, everyone else crew (MatchBuilder
        // drops unlinked players, so the impostor must be linked or the match refuses).
        var lobby = new List<(string id, string name, bool linked)>();
        var clients = client.allClients;
        for (int i = 0; i < clients.Count; i++)
        {
            var cd = clients[i];
            var pc = cd?.Character;
            if (pc == null) continue;
            string id = pc.PlayerId.ToString();
            string name = pc.Data != null ? pc.Data.PlayerName : "P" + pc.PlayerId;
            lobby.Add((id, name, host.IsLinked(id)));
        }

        int linkedCount = lobby.FindAll(p => p.linked).Count;
        if (linkedCount < 2) { Chat("F9: need 2+ LINKED players in the lobby (wait for the link check)"); return; }

        int impIndex = lobby.FindIndex(p => p.linked); // first linked player is the impostor
        var roster = new List<RosterEntry>();
        for (int i = 0; i < lobby.Count; i++)
            roster.Add(new RosterEntry(lobby[i].id, lobby[i].name, i == impIndex ? Role.IMPOSTOR : Role.CREW));

        var imp = roster[impIndex];
        RosterEntry crew = roster.Find(r => r.Role == Role.CREW && host.IsLinked(r.InGameId));

        string code = "DBG-" + DateTimeOffset.UtcNow.ToUnixTimeSeconds() + "-" + (++_counter);
        host.Enqueue(new GameStarted(code, "Skeld", DateTimeOffset.UtcNow, roster));
        foreach (var r in roster) if (r.Role == Role.CREW) host.Enqueue(new TasksAssigned(r.InGameId, 5));
        if (crew != null)
        {
            host.Enqueue(new TaskCompleted(crew.InGameId, 4000));
            host.Enqueue(new PlayerKilled(imp.InGameId, crew.InGameId, 12000));
            var votes = new List<VoteCast>();
            foreach (var r in roster)
                if (r.Role == Role.CREW && r.InGameId != crew.InGameId) votes.Add(new VoteCast(r.InGameId, imp.InGameId));
            host.Enqueue(new MeetingEnded(imp.InGameId, votes)); // impostor voted out -> crew win
        }
        host.Enqueue(new GameEnded(Outcome.CREW_WIN, DateTimeOffset.UtcNow));

        Chat("F9: scripted CREW_WIN sent - watch the leaderboard");
        GameWatcherPlugin.Logger?.LogInfo($"[inject] scripted {code}: {roster.Count} players, {linkedCount} linked");
    }

    private static void Chat(string m) { var l = PlayerControl.LocalPlayer; if (l != null) l.RpcSendChat(m); }
}
