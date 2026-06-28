using System.Text.Json;
using System.Text.Json.Serialization;

namespace GameWatcher.Core.Json
{
    // Single source of truth for how the brain talks JSON to the website.
    // camelCase property names + omit-null match src/lib/ingest/schema.ts; the bare
    // JsonStringEnumConverter emits enum MEMBER NAMES verbatim (CREW/IMPOSTOR/CREW_WIN/IMP_WIN).
    public static class GameWatcherJson
    {
        public static readonly JsonSerializerOptions Options = Build();

        private static JsonSerializerOptions Build()
        {
            var o = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                PropertyNameCaseInsensitive = true,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            };
            o.Converters.Add(new JsonStringEnumConverter());
            return o;
        }

        public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

        public static T? Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);
    }
}
