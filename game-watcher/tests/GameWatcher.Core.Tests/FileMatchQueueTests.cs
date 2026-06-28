using System.IO;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Queue;

namespace GameWatcher.Core.Tests
{
    public class FileMatchQueueTests
    {
        private static MatchPayload P(string code) => new(
            code, null, "2026-06-27T17:00:00Z", "2026-06-27T17:10:00Z", Outcome.CREW_WIN,
            new[] { new Participant("p", Role.CREW, true, 0, 0, 0, 0, 0, true) });

        [Fact]
        public void Persists_across_instances_and_dedups()
        {
            var path = Path.Combine(Path.GetTempPath(), "gw-queue-" + Path.GetRandomFileName() + ".json");
            try
            {
                var q1 = new FileMatchQueue(path);
                q1.Enqueue(P("A"));
                q1.Enqueue(P("B"));
                q1.Enqueue(P("A")); // dedup by matchCode
                Assert.Equal(2, q1.Count);

                var q2 = new FileMatchQueue(path); // reload from disk
                Assert.Equal(2, q2.Count);
                q2.Remove("A");

                var q3 = new FileMatchQueue(path);
                Assert.Equal(1, q3.Count);
                Assert.Equal("B", q3.Snapshot()[0].MatchCode);
            }
            finally
            {
                if (File.Exists(path)) File.Delete(path);
            }
        }

        [Fact]
        public void Corrupt_file_loads_as_empty_without_throwing()
        {
            var path = Path.Combine(Path.GetTempPath(), "gw-queue-" + Path.GetRandomFileName() + ".json");
            try
            {
                File.WriteAllText(path, "[{\"matchCode\":\"A\","); // truncated JSON
                var q = new FileMatchQueue(path);                 // must NOT throw in the ctor
                Assert.Equal(0, q.Count);
            }
            finally
            {
                if (File.Exists(path)) File.Delete(path);
            }
        }
    }
}
