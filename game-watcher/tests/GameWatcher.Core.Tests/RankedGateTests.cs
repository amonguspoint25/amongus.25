using System.Net.Http;
using System.Threading.Tasks;
using GameWatcher.Core;
using GameWatcher.Core.Tests.Testing;

namespace GameWatcher.Core.Tests
{
    public class RankedGateTests
    {
        [Theory]
        [InlineData(200, RankedStatus.Enabled)]
        [InlineData(401, RankedStatus.Disabled)]
        [InlineData(500, RankedStatus.Unknown)] // server error -> uncertain, not "off"
        [InlineData(0, RankedStatus.Unknown)]   // network failure -> uncertain, not "off"
        public async Task Maps_status(int status, RankedStatus expected)
        {
            var t = FakeTransport.Always(status, status == 200 ? "{\"valid\":true}" : "{\"valid\":false}");
            var gate = new RankedGate(t);

            Assert.Equal(expected, await gate.GetStatusAsync());
            Assert.Single(t.Requests);
            Assert.Equal(HttpMethod.Get, t.Requests[0].Method);
            Assert.Equal("/api/host/status", t.Requests[0].Path);
        }
    }
}
