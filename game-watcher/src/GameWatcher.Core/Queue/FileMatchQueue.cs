using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using GameWatcher.Core.Domain;
using GameWatcher.Core.Json;

namespace GameWatcher.Core.Queue
{
    // Crash-durable queue: a single JSON file, written ATOMICALLY (temp + move) so a crash mid-write
    // can't leave a torn file, and read fault-tolerantly so a corrupt/locked file degrades to empty
    // instead of crashing startup. Lock-guarded for the timer-drain + event-send threads.
    // ponytail: full-file rewrite, not an append log — a ranked session has at most a handful of unsent
    // matches, so O(n) rewrites are free. I/O faults are surfaced via onError, not swallowed or thrown
    // into the game-event pipeline.
    public sealed class FileMatchQueue : IMatchQueue
    {
        private readonly string _path;
        private readonly Action<string>? _onError;
        private readonly object _lock = new();
        private readonly List<MatchPayload> _items;

        public FileMatchQueue(string path, Action<string>? onError = null)
        {
            _path = path;
            _onError = onError;
            _items = Load(path, onError);
        }

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
                Save();
            }
        }

        public IReadOnlyList<MatchPayload> Snapshot()
        {
            lock (_lock) { return _items.ToList(); }
        }

        public void Remove(string matchCode)
        {
            lock (_lock)
            {
                if (_items.RemoveAll(p => p.MatchCode == matchCode) > 0) Save();
            }
        }

        private static List<MatchPayload> Load(string path, Action<string>? onError)
        {
            try
            {
                if (!File.Exists(path)) return new List<MatchPayload>();
                var json = File.ReadAllText(path);
                if (string.IsNullOrWhiteSpace(json)) return new List<MatchPayload>();
                return GameWatcherJson.Deserialize<List<MatchPayload>>(json) ?? new List<MatchPayload>();
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is JsonException)
            {
                // Corrupt/locked queue file: start empty rather than crash startup. The bad file is
                // overwritten on the next successful Save; atomic writes mean we only hit this if an
                // external process corrupted it. Surfaced, not silent.
                onError?.Invoke($"FileMatchQueue: could not read '{path}', starting empty: {ex.Message}");
                return new List<MatchPayload>();
            }
        }

        // Caller holds _lock.
        private void Save()
        {
            try
            {
                var dir = Path.GetDirectoryName(_path);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                var tmp = _path + ".tmp";
                File.WriteAllText(tmp, GameWatcherJson.Serialize(_items));
                // netstandard2.1 lacks File.Move(overwrite). File.Replace is atomic-ish on Windows
                // (ReplaceFile) when the live file exists; first write falls back to a plain Move.
                if (File.Exists(_path)) File.Replace(tmp, _path, destinationBackupFileName: null);
                else File.Move(tmp, _path);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                // Keep the in-memory copy (this session's DrainAsync can still retry); don't throw into
                // the game-event pipeline. Surfaced via onError, not swallowed.
                _onError?.Invoke($"FileMatchQueue: could not persist '{_path}': {ex.Message}");
            }
        }
    }
}
