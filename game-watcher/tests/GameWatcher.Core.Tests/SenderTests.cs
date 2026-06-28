using System;
using System.Net.Http;
using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Http;
using GameWatcher.Core.Queue;
using GameWatcher.Core.Tests.Testing;

namespace GameWatcher.Core.Tests
{
    public class SenderTests
    {
        private static MatchPayload Payload(string code = "M1") => new(
            code, null, "2026-06-27T17:00:00Z", "2026-06-27T17:10:00Z", Outcome.CREW_WIN,
            new[] { new Participant("p", Role.CREW, true, 0, 0, 0, 0, 0, true) });

        [Fact]
        public async Task Sent_on_200_nothing_queued()
        {
            var q = new InMemoryMatchQueue();
            var r = await new Sender(FakeTransport.Always(200), q).SendAsync(Payload());

            Assert.Equal(SendStatus.Sent, r.Status);
            Assert.Equal(0, q.Count);
        }

        [Fact]
        public async Task Parses_elo_deltas_from_200_body()
        {
            var body = "{\"matchId\":\"m\",\"results\":[" +
                       "{\"playerId\":\"p1\",\"name\":\"Alice\",\"role\":\"IMPOSTOR\",\"eloDelta\":15}," +
                       "{\"playerId\":\"p2\",\"name\":\"Bob\",\"role\":\"CREW\",\"eloDelta\":-8}]}";
            var r = await new Sender(FakeTransport.Always(200, body), new InMemoryMatchQueue()).SendAsync(Payload());

            Assert.Equal(SendStatus.Sent, r.Status);
            Assert.NotNull(r.Deltas);
            Assert.Equal(2, r.Deltas!.Count);
            Assert.Equal("Alice", r.Deltas[0].Name);
            Assert.Equal(15, r.Deltas[0].Value);
            Assert.Equal(-8, r.Deltas[1].Value);
        }

        [Theory]
        [InlineData(500)]
        [InlineData(429)]
        [InlineData(0)] // network failure
        public async Task Transient_queues(int status)
        {
            var q = new InMemoryMatchQueue();
            var r = await new Sender(FakeTransport.Always(status), q).SendAsync(Payload());

            Assert.Equal(SendStatus.Queued, r.Status);
            Assert.Equal(1, q.Count);
        }

        [Fact]
        public async Task Rejected_400_not_queued()
        {
            var q = new InMemoryMatchQueue();
            var r = await new Sender(FakeTransport.Always(400, "{\"error\":{}}"), q).SendAsync(Payload());

            Assert.Equal(SendStatus.RejectedPermanent, r.Status);
            Assert.Equal(0, q.Count);
        }

        [Fact]
        public async Task Unauthorized_401_queued_for_reauth()
        {
            var q = new InMemoryMatchQueue();
            var r = await new Sender(FakeTransport.Always(401), q).SendAsync(Payload());

            Assert.Equal(SendStatus.Unauthorized, r.Status);
            Assert.Equal(1, q.Count); // parked for re-auth, consistent with DrainAsync (spec §6)
        }

        [Fact]
        public async Task SendAsync_persists_on_cancellation()
        {
            var q = new InMemoryMatchQueue();
            var t = new FakeTransport(_ => throw new OperationCanceledException());

            await Assert.ThrowsAsync<OperationCanceledException>(() => new Sender(t, q).SendAsync(Payload()));
            Assert.Equal(1, q.Count); // a finished match isn't lost on shutdown mid-POST
        }

        [Fact]
        public async Task Dedups_same_matchCode_in_queue()
        {
            var q = new InMemoryMatchQueue();
            var s = new Sender(FakeTransport.Always(500), q);
            await s.SendAsync(Payload("X"));
            await s.SendAsync(Payload("X"));

            Assert.Equal(1, q.Count);
        }

        [Fact]
        public async Task Drain_sends_all_when_back_online()
        {
            var q = new InMemoryMatchQueue();
            q.Enqueue(Payload("A"));
            q.Enqueue(Payload("B"));
            var d = await new Sender(FakeTransport.Always(200), q).DrainAsync();

            Assert.Equal(2, d.Sent);
            Assert.Equal(0, q.Count);
        }

        [Fact]
        public async Task Drain_keeps_queue_on_transient()
        {
            var q = new InMemoryMatchQueue();
            q.Enqueue(Payload("A"));
            var d = await new Sender(FakeTransport.Always(503), q).DrainAsync();

            Assert.Equal(0, d.Sent);
            Assert.Equal(1, d.Remaining);
        }

        [Fact]
        public async Task Drain_drops_400_then_continues_to_next()
        {
            var q = new InMemoryMatchQueue();
            q.Enqueue(Payload("A"));
            q.Enqueue(Payload("B"));
            var calls = 0;
            var t = new FakeTransport(_ => new HttpResponse(calls++ == 0 ? 400 : 200, "")); // A=400, B=200
            var d = await new Sender(t, q).DrainAsync();

            Assert.Equal(1, d.Dropped);
            Assert.Equal(1, d.Sent);
            Assert.Equal(0, q.Count);
        }

        [Fact]
        public async Task Drain_continues_past_transient_item_no_head_of_line_block()
        {
            var q = new InMemoryMatchQueue();
            q.Enqueue(Payload("A"));
            q.Enqueue(Payload("B"));
            var calls = 0;
            var t = new FakeTransport(_ => new HttpResponse(calls++ == 0 ? 503 : 200, "")); // A transient, B ok
            var d = await new Sender(t, q).DrainAsync();

            Assert.Equal(1, d.Sent);      // B got through despite A failing at the head
            Assert.Equal(1, d.Remaining); // A still queued
        }

        [Fact]
        public async Task Drain_stops_unauthorized_keeps_queue()
        {
            var q = new InMemoryMatchQueue();
            q.Enqueue(Payload("A"));
            q.Enqueue(Payload("B"));
            var d = await new Sender(FakeTransport.Always(401), q).DrainAsync();

            Assert.True(d.StoppedUnauthorized);
            Assert.Equal(2, q.Count);
        }

        [Fact]
        public async Task Posts_to_ingest_path()
        {
            var t = FakeTransport.Always(200);
            await new Sender(t, new InMemoryMatchQueue()).SendAsync(Payload());

            Assert.Equal(HttpMethod.Post, t.Requests[0].Method);
            Assert.Equal("/api/ingest/match", t.Requests[0].Path);
        }
    }
}
