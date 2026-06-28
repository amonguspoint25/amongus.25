using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Http;
using GameWatcher.Core.Json;
using GameWatcher.Core.Queue;
using GameWatcher.Core.Tests.Testing;

namespace GameWatcher.Core.Tests
{
    // The §5.6 end-to-end cases through the brain's top-level API.
    public class MatchSessionTests
    {
        // Mints a distinct playerId per link code ("P_<CODE>"); validates the key; accepts ingest.
        private static FakeTransport Wired() => new(req => req.Path switch
        {
            "/api/host/status" => new HttpResponse(200, "{\"valid\":true}"),
            "/api/link" => new HttpResponse(200, "{\"ok\":true,\"playerId\":\"P_" + CodeOf(req.JsonBody) + "\",\"displayName\":\"x\"}"),
            "/api/ingest/match" => new HttpResponse(200, "{}"),
            _ => new HttpResponse(404, ""),
        });

        private static string CodeOf(string? body)
        {
            using var doc = JsonDocument.Parse(body!);
            return doc.RootElement.GetProperty("linkCode").GetString()!;
        }

        private static MatchSession NewSession(FakeTransport t) =>
            new(new RankedGate(t), new LinkManager(t), new MatchRecorder(), new MatchBuilder(),
                new Sender(t, new InMemoryMatchQueue()));

        [Fact]
        public async Task Full_game_links_records_and_sends()
        {
            var t = Wired();
            var s = NewSession(t);

            await s.HandleAsync(new ChatMessage("imp", "code aaaa2345"));
            await s.HandleAsync(new ChatMessage("c1", "bbbb2345"));
            await s.HandleAsync(new ChatMessage("c2", "my code cccc2345"));

            var started = await s.HandleAsync(new GameStarted("M1", "Skeld",
                DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
                new[]
                {
                    new RosterEntry("imp", "Imp", Role.IMPOSTOR),
                    new RosterEntry("c1", "C1", Role.CREW),
                    new RosterEntry("c2", "C2", Role.CREW),
                }));
            Assert.Equal(SessionResultKind.Recording, started.Kind);

            await s.HandleAsync(new TasksAssigned("c1", 3));
            await s.HandleAsync(new TasksAssigned("c2", 3));
            await s.HandleAsync(new TaskCompleted("c1", 10));
            await s.HandleAsync(new PlayerKilled("imp", "c2", 50));
            await s.HandleAsync(new MeetingEnded(null, new[] { new VoteCast("c1", "imp") })); // c1 correct shot
            var ended = await s.HandleAsync(new GameEnded(Outcome.IMP_WIN, DateTimeOffset.Parse("2026-06-27T17:12:00Z")));

            Assert.Equal(SessionResultKind.Sent, ended.Kind);
            Assert.Equal(SendStatus.Sent, ended.Send!.Status);

            var ingest = t.Requests.Last(r => r.Path == "/api/ingest/match");
            var payload = GameWatcherJson.Deserialize<MatchPayload>(ingest.JsonBody!)!;
            Assert.Equal("M1", payload.MatchCode);
            Assert.Equal(Outcome.IMP_WIN, payload.Outcome);
            Assert.Equal(3, payload.Participants.Count);

            var imp = payload.Participants.Single(p => p.PlayerId == "P_AAAA2345");
            Assert.True(imp.Won);
            Assert.Equal(1, imp.Kills);

            var c1 = payload.Participants.Single(p => p.PlayerId == "P_BBBB2345");
            Assert.False(c1.Won);
            Assert.Equal(1, c1.CorrectShots);
            Assert.Equal(1, c1.TasksDone);

            var c2 = payload.Participants.Single(p => p.PlayerId == "P_CCCC2345");
            Assert.False(c2.Survived); // killed
        }

        [Fact]
        public async Task Unarmed_game_produces_nothing()
        {
            var t = new FakeTransport(req => req.Path == "/api/host/status"
                ? new HttpResponse(401, "{\"valid\":false}")
                : new HttpResponse(200, "{}"));
            var q = new InMemoryMatchQueue();
            var s = new MatchSession(new RankedGate(t), new LinkManager(t), new MatchRecorder(), new MatchBuilder(), new Sender(t, q));

            var started = await s.HandleAsync(new GameStarted("M1", null, DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
                new[] { new RosterEntry("imp", "Imp", Role.IMPOSTOR), new RosterEntry("c1", "C1", Role.CREW) }));
            Assert.Equal(SessionResultKind.NotRanked, started.Kind);

            await s.HandleAsync(new PlayerKilled("imp", "c1", 1));
            var ended = await s.HandleAsync(new GameEnded(Outcome.IMP_WIN, DateTimeOffset.Parse("2026-06-27T17:05:00Z")));

            Assert.Equal(SessionResultKind.None, ended.Kind);
            Assert.Equal(0, q.Count);
            Assert.DoesNotContain(t.Requests, r => r.Path == "/api/ingest/match");
        }

        [Fact]
        public async Task Refuses_when_a_whole_role_unlinked()
        {
            var t = Wired();
            var s = NewSession(t);

            // only crew link; the impostor never types a code
            await s.HandleAsync(new ChatMessage("c1", "bbbb2345"));
            await s.HandleAsync(new ChatMessage("c2", "cccc2345"));
            await s.HandleAsync(new GameStarted("M1", null, DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
                new[]
                {
                    new RosterEntry("imp", "Imp", Role.IMPOSTOR),
                    new RosterEntry("c1", "C1", Role.CREW),
                    new RosterEntry("c2", "C2", Role.CREW),
                }));
            var ended = await s.HandleAsync(new GameEnded(Outcome.CREW_WIN, DateTimeOffset.Parse("2026-06-27T17:05:00Z")));

            Assert.Equal(SessionResultKind.Refused, ended.Kind);
            Assert.Contains("impostor", ended.Warning!, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(t.Requests, r => r.Path == "/api/ingest/match");
        }

        [Fact]
        public async Task Transient_send_at_game_end_queues()
        {
            var t = new FakeTransport(req => req.Path switch
            {
                "/api/host/status" => new HttpResponse(200, "{\"valid\":true}"),
                "/api/link" => new HttpResponse(200, "{\"ok\":true,\"playerId\":\"P_" + CodeOf(req.JsonBody) + "\"}"),
                "/api/ingest/match" => new HttpResponse(503, ""), // site down at game end
                _ => new HttpResponse(404, ""),
            });
            var q = new InMemoryMatchQueue();
            var s = new MatchSession(new RankedGate(t), new LinkManager(t), new MatchRecorder(), new MatchBuilder(), new Sender(t, q));

            await s.HandleAsync(new ChatMessage("imp", "aaaa2345"));
            await s.HandleAsync(new ChatMessage("c1", "bbbb2345"));
            await s.HandleAsync(new GameStarted("M1", null, DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
                new[] { new RosterEntry("imp", "Imp", Role.IMPOSTOR), new RosterEntry("c1", "C1", Role.CREW) }));
            var ended = await s.HandleAsync(new GameEnded(Outcome.IMP_WIN, DateTimeOffset.Parse("2026-06-27T17:05:00Z")));

            Assert.Equal(SessionResultKind.Sent, ended.Kind);
            Assert.Equal(SendStatus.Queued, ended.Send!.Status);
            Assert.Equal(1, q.Count); // parked for retry (spec §6)
        }

        [Fact]
        public async Task Unreachable_status_records_optimistically_and_sends()
        {
            var t = new FakeTransport(req => req.Path switch
            {
                "/api/host/status" => new HttpResponse(500, ""), // site blip at game start -> Unknown
                "/api/link" => new HttpResponse(200, "{\"ok\":true,\"playerId\":\"P_" + CodeOf(req.JsonBody) + "\"}"),
                "/api/ingest/match" => new HttpResponse(200, ""), // site back by game end
                _ => new HttpResponse(404, ""),
            });
            var q = new InMemoryMatchQueue();
            var s = new MatchSession(new RankedGate(t), new LinkManager(t), new MatchRecorder(), new MatchBuilder(), new Sender(t, q));

            await s.HandleAsync(new ChatMessage("imp", "aaaa2345"));
            await s.HandleAsync(new ChatMessage("c1", "bbbb2345"));
            var started = await s.HandleAsync(new GameStarted("M1", null, DateTimeOffset.Parse("2026-06-27T17:00:00Z"),
                new[] { new RosterEntry("imp", "Imp", Role.IMPOSTOR), new RosterEntry("c1", "C1", Role.CREW) }));
            Assert.Equal(SessionResultKind.RecordingUnverified, started.Kind);

            var ended = await s.HandleAsync(new GameEnded(Outcome.IMP_WIN, DateTimeOffset.Parse("2026-06-27T17:05:00Z")));
            Assert.Equal(SessionResultKind.Sent, ended.Kind);
            Assert.Equal(SendStatus.Sent, ended.Send!.Status);
        }
    }
}
