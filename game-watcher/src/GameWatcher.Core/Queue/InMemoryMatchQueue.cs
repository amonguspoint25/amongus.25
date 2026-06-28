using System.Collections.Generic;
using System.Linq;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core.Queue
{
    // Volatile queue — fine for tests and for a session that never restarts; the host mod uses
    // FileMatchQueue so a crash mid-game doesn't lose a finished match. Lock-guarded so a timer-driven
    // DrainAsync and an event-driven SendAsync can touch it from different threads safely.
    public sealed class InMemoryMatchQueue : IMatchQueue
    {
        private readonly object _lock = new();
        private readonly List<MatchPayload> _items = new();

        public int Count
        {
            get { lock (_lock) { return _items.Count; } }
        }

        public void Enqueue(MatchPayload payload)
        {
            lock (_lock)
            {
                if (_items.Any(p => p.MatchCode == payload.MatchCode)) return; // dedup by matchCode
                _items.Add(payload);
            }
        }

        public IReadOnlyList<MatchPayload> Snapshot()
        {
            lock (_lock) { return _items.ToList(); }
        }

        public void Remove(string matchCode)
        {
            lock (_lock) { _items.RemoveAll(p => p.MatchCode == matchCode); }
        }
    }
}
