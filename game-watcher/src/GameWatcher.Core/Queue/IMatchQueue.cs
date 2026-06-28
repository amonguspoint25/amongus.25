using System.Collections.Generic;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core.Queue
{
    // Durable holding pen for matches that failed to send. Dedup by MatchCode so a match
    // is never queued twice; the server is idempotent by matchCode, so re-sends are safe.
    public interface IMatchQueue
    {
        void Enqueue(MatchPayload payload);
        IReadOnlyList<MatchPayload> Snapshot();
        void Remove(string matchCode);
        int Count { get; }
    }
}
