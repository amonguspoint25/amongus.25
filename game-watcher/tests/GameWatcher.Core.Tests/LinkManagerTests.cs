using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Tests.Testing;

namespace GameWatcher.Core.Tests
{
    public class LinkManagerTests
    {
        [Theory]
        [InlineData("my code is abcd2345 ok", true, "ABCD2345")] // lower-cased, mid-sentence
        [InlineData("ABCD2345", true, "ABCD2345")]
        [InlineData("gg wp nice", false, "")]
        [InlineData("ABCDLFGH", false, "")]   // contains L (excluded from alphabet)
        [InlineData("ABCD2345X", false, "")]  // 9-char alnum run -> no 8-char \b match
        [InlineData("ABC2345", false, "")]    // 7 chars
        public void TryExtractCode(string text, bool ok, string expected)
        {
            Assert.Equal(ok, LinkManager.TryExtractCode(text, out var code));
            Assert.Equal(expected, code);
        }

        [Fact]
        public async Task Redeem_caches_playerId_on_200()
        {
            var t = FakeTransport.Always(200, "{\"ok\":true,\"playerId\":\"pid-7\",\"displayName\":\"Red\"}");
            var lm = new LinkManager(t);

            Assert.True(await lm.RedeemAsync("ingame-1", "ABCD2345"));
            Assert.True(lm.TryGetPlayerId("ingame-1", out var pid));
            Assert.Equal("pid-7", pid);
            Assert.Equal("/api/link", t.Requests[0].Path);
            Assert.Contains("\"linkCode\":\"ABCD2345\"", t.Requests[0].JsonBody);
        }

        [Fact]
        public async Task Redeem_404_does_not_cache()
        {
            var t = FakeTransport.Always(404, "{\"error\":\"invalid or expired code\"}");
            var lm = new LinkManager(t);

            Assert.False(await lm.RedeemAsync("ingame-1", "ABCD2345"));
            Assert.False(lm.TryGetPlayerId("ingame-1", out _));
        }

        [Fact]
        public async Task Redeem_rejects_malformed_locally_without_calling_server()
        {
            var t = FakeTransport.Always(200, "{\"ok\":true,\"playerId\":\"x\"}");
            var lm = new LinkManager(t);

            Assert.False(await lm.RedeemAsync("ingame-1", "BAD"));       // too short
            Assert.False(await lm.RedeemAsync("ingame-1", "ABCDLFGH"));  // contains L
            Assert.Empty(t.Requests);                                    // never burned a network call
        }

        [Fact]
        public async Task HandleChat_links_when_code_present()
        {
            var t = FakeTransport.Always(200, "{\"ok\":true,\"playerId\":\"pid\"}");
            var lm = new LinkManager(t);

            Assert.True(await lm.HandleChatAsync(new ChatMessage("g1", "here: abcd2345")));
            Assert.True(lm.TryGetPlayerId("g1", out _));
        }

        [Fact]
        public async Task HandleChat_ignores_non_code_chat()
        {
            var t = FakeTransport.Always(200, "x");
            var lm = new LinkManager(t);

            Assert.False(await lm.HandleChatAsync(new ChatMessage("g1", "gg wp")));
            Assert.Empty(t.Requests);
        }

        [Fact]
        public async Task Redeem_200_not_ok_returns_false()
        {
            var lm = new LinkManager(FakeTransport.Always(200, "{\"ok\":false}"));
            Assert.False(await lm.RedeemAsync("g1", "ABCD2345"));
            Assert.False(lm.TryGetPlayerId("g1", out _));
        }

        [Fact]
        public async Task Redeem_200_empty_playerId_returns_false()
        {
            var lm = new LinkManager(FakeTransport.Always(200, "{\"ok\":true,\"playerId\":\"\"}"));
            Assert.False(await lm.RedeemAsync("g1", "ABCD2345"));
            Assert.False(lm.TryGetPlayerId("g1", out _));
        }

        [Fact]
        public async Task Redeem_malformed_200_body_returns_false()
        {
            var lm = new LinkManager(FakeTransport.Always(200, "not json"));
            Assert.False(await lm.RedeemAsync("g1", "ABCD2345")); // JsonException caught, not thrown
            Assert.False(lm.TryGetPlayerId("g1", out _));
        }
    }
}
