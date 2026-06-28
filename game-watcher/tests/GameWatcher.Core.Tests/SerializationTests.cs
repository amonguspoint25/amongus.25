using System.Text.Json;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Json;

namespace GameWatcher.Core.Tests
{
    // The schema-conformance keystone: the produced JSON must match src/lib/ingest/schema.ts
    // exactly, or the server 400s the whole match.
    public class SerializationTests
    {
        private static MatchPayload Sample(string? map = null) => new(
            MatchCode: "LOBBY1-1719500000",
            Map: map,
            StartedAt: "2026-06-27T17:00:00.0000000+00:00",
            EndedAt: "2026-06-27T17:20:00.0000000+00:00",
            Outcome: Outcome.IMP_WIN,
            Participants: new[]
            {
                new Participant("imp1", Role.IMPOSTOR, true, 2, 0, 0, 0, 0, false),
                new Participant("crew1", Role.CREW, false, 0, 1, 1, 3, 5, true),
            });

        [Fact]
        public void Enums_serialize_as_exact_server_strings()
        {
            using var doc = JsonDocument.Parse(GameWatcherJson.Serialize(Sample()));
            var root = doc.RootElement;
            Assert.Equal("IMP_WIN", root.GetProperty("outcome").GetString());
            Assert.Equal("IMPOSTOR", root.GetProperty("participants")[0].GetProperty("role").GetString());
            Assert.Equal("CREW", root.GetProperty("participants")[1].GetProperty("role").GetString());
        }

        [Fact]
        public void Property_names_are_camelCase()
        {
            using var doc = JsonDocument.Parse(GameWatcherJson.Serialize(Sample()));
            var root = doc.RootElement;
            foreach (var key in new[] { "matchCode", "startedAt", "endedAt", "outcome", "participants" })
                Assert.True(root.TryGetProperty(key, out _), $"missing top-level {key}");

            var p = root.GetProperty("participants")[1];
            foreach (var key in new[] { "playerId", "role", "won", "kills", "correctShots", "incorrectShots", "tasksDone", "tasksTotal", "survived" })
                Assert.True(p.TryGetProperty(key, out _), $"missing participant {key}");
        }

        [Fact]
        public void Null_optionals_are_omitted()
        {
            using var doc = JsonDocument.Parse(GameWatcherJson.Serialize(Sample(map: null)));
            var root = doc.RootElement;
            Assert.False(root.TryGetProperty("map", out _));
            var imp = root.GetProperty("participants")[0];
            Assert.False(imp.TryGetProperty("timeToKillMs", out _));
            Assert.False(imp.TryGetProperty("timeToTaskMs", out _));
        }

        [Fact]
        public void Map_present_when_set()
        {
            using var doc = JsonDocument.Parse(GameWatcherJson.Serialize(Sample(map: "Skeld")));
            Assert.Equal("Skeld", doc.RootElement.GetProperty("map").GetString());
        }

        [Fact]
        public void Time_fields_present_when_set()
        {
            var p = new Participant("imp1", Role.IMPOSTOR, true, 1, 0, 0, 0, 0, true, TimeToKillMs: 1234, TimeToTaskMs: 5678);
            using var doc = JsonDocument.Parse(GameWatcherJson.Serialize(p));
            Assert.Equal(1234, doc.RootElement.GetProperty("timeToKillMs").GetInt32());
            Assert.Equal(5678, doc.RootElement.GetProperty("timeToTaskMs").GetInt32());
        }

        [Fact]
        public void Roundtrips_stably()
        {
            var json = GameWatcherJson.Serialize(Sample("Polus"));
            var back = GameWatcherJson.Deserialize<MatchPayload>(json);
            Assert.NotNull(back);
            Assert.Equal(json, GameWatcherJson.Serialize(back!));
        }
    }
}
