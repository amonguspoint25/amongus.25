using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Http;
using GameWatcher.Core.Tests.Testing;

namespace GameWatcher.Core.Tests
{
    public class RosterResolutionTests
    {
        [Fact]
        public async Task Caches_matched_and_returns_unmatched()
        {
            var transport = new FakeTransport(_ => new HttpResponse(200,
                "{\"matched\":[{\"inGameId\":1,\"playerId\":\"p1\",\"displayName\":\"Red\"}],\"unmatched\":[2]}"));
            var lm = new LinkManager(transport);

            var unmatched = await lm.ResolveRosterAsync(new[]
            {
                new RosterPlayer(1, "gifteddolphin#5731"),
                new RosterPlayer(2, "lostfox#1234"),
            });

            Assert.True(lm.TryGetPlayerId("1", out var pid));
            Assert.Equal("p1", pid);
            Assert.Equal(new[] { 2 }, unmatched);
        }

        [Fact]
        public async Task Non200_blocks_all_and_caches_nothing()
        {
            var transport = FakeTransport.Always(401, "{\"valid\":false}");
            var lm = new LinkManager(transport);

            var unmatched = await lm.ResolveRosterAsync(new[]
            {
                new RosterPlayer(1, "a#111"),
                new RosterPlayer(2, "b#222"),
            });

            Assert.Equal(new[] { 1, 2 }, unmatched);
            Assert.False(lm.TryGetPlayerId("1", out _));
        }

        [Fact]
        public async Task Malformed200_blocks_all_and_caches_nothing()
        {
            // HTTP 200 with a body that fails JSON parsing hits the catch (JsonException) branch —
            // the fail-closed safety path that must block ranked, not pass it.
            var transport = new FakeTransport(_ => new HttpResponse(200, "{ not valid json"));
            var lm = new LinkManager(transport);

            var unmatched = await lm.ResolveRosterAsync(new[]
            {
                new RosterPlayer(1, "x#001"),
                new RosterPlayer(2, "y#002"),
            });

            Assert.Equal(new[] { 1, 2 }, unmatched);
            Assert.False(lm.TryGetPlayerId("1", out _));
        }
    }
}
