# Ranked Stat & Scoring Foundation (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Core brain and the website so the ingest/scoring contract carries `roundsSurvived` and time-to-kill/task, exposes per-player ELO deltas, and the brain can bulk-resolve a lobby by friend code — all offline-testable, with no game involved.

**Architecture:** Two toolchains meeting at the JSON ingest contract. The C# `GameWatcher.Core` library (netstandard2.1, xUnit) gains additive stat derivation, a pure `RankedTimer`, and roster resolution. The Next.js website (TypeScript, zod, Prisma, vitest) gains the matching schema field, a migration, the ELO weighting, and a delta-returning `processMatch`. This plan is the foundation for Plan B (the IL2CPP plugin), which consumes `RankedTimer`, roster resolution, and the extended `Participant`.

**Tech Stack:** C# / .NET (netstandard2.1 lib, net10.0 xUnit tests), System.Text.Json; TypeScript, Next.js 16, zod 4, Prisma 7 + Postgres, vitest 4.

## Global Constraints

- **Core targets `netstandard2.1`** with `TreatWarningsAsErrors` — builds must stay 0-warning.
- **JSON contract is camelCase and must match `src/lib/ingest/schema.ts` field-for-field** — verified by the brain's `SerializationTests`.
- **All changes are additive and back-compatible** — existing seed data and the 59 brain tests must still pass; new payload fields are optional on the wire.
- **C# tests run from `game-watcher/` via `dotnet test`** (target: 59 existing + new, all green).
- **Website tests run from the repo root via `npm test`** (vitest) and **require a reachable test Postgres** (`DATABASE_URL`) — the `processMatch` tests create/delete rows. The Prisma migration also needs that DB.
- **Commits omit any Claude co-author/attribution line** (attribution disabled globally).
- Work happens on branch `feat/game-watcher-plugin` (already checked out).

---

### Task 1: Add `RoundsSurvived` to the wire `Participant`

**Files:**
- Modify: `game-watcher/src/GameWatcher.Core/Domain/Wire.cs`
- Test: `game-watcher/tests/GameWatcher.Core.Tests/SerializationTests.cs`

**Interfaces:**
- Produces: `Participant(string PlayerId, Role Role, bool Won, int Kills, int CorrectShots, int IncorrectShots, int TasksDone, int TasksTotal, bool Survived, int RoundsSurvived = 0, int? TimeToKillMs = null, int? TimeToTaskMs = null)` — `RoundsSurvived` is a new optional positional param inserted after `Survived`, so existing 9-arg positional and named constructions still compile.

- [ ] **Step 1: Write the failing test**

Add to `SerializationTests.cs`:

```csharp
[Fact]
public void RoundsSurvived_serializes_as_a_camelCase_number()
{
    var p = new Participant("imp1", Role.IMPOSTOR, true, 1, 0, 0, 0, 0, true, RoundsSurvived: 4);
    using var doc = JsonDocument.Parse(GameWatcherJson.Serialize(p));
    Assert.Equal(4, doc.RootElement.GetProperty("roundsSurvived").GetInt32());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~SerializationTests` (from `game-watcher/`)
Expected: BUILD FAILS — `Participant` has no parameter named `RoundsSurvived`.

- [ ] **Step 3: Add the field**

In `Wire.cs`, change the `Participant` record so the line after `bool Survived,` reads:

```csharp
        bool Survived,
        int RoundsSurvived = 0,      // count of meeting rounds alive-and-not-ejected (spec §10)
        int? TimeToKillMs = null,    // DEFERRED no longer — derived by the recorder (Task 3)
        int? TimeToTaskMs = null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~SerializationTests`
Expected: PASS (all serialization tests green).

- [ ] **Step 5: Commit**

```bash
git add game-watcher/src/GameWatcher.Core/Domain/Wire.cs game-watcher/tests/GameWatcher.Core.Tests/SerializationTests.cs
git commit -m "feat(core): add roundsSurvived to the ingest Participant"
```

---

### Task 2: Derive `roundsSurvived` in the recorder

**Files:**
- Modify: `game-watcher/src/GameWatcher.Core/MatchRecorder.cs`
- Modify: `game-watcher/src/GameWatcher.Core/MatchBuilder.cs`
- Test: `game-watcher/tests/GameWatcher.Core.Tests/MatchRecorderTests.cs`

**Interfaces:**
- Consumes: `Participant(... RoundsSurvived ...)` from Task 1.
- Produces: `PlayerTally(string InGameId, string Name, Role Role, int Kills, int CorrectShots, int IncorrectShots, int TasksDone, int TasksTotal, bool Survived, int RoundsSurvived)` — new required field appended.

- [ ] **Step 1: Write the failing test**

Add to `MatchRecorderTests.cs`:

```csharp
[Fact]
public void Counts_rounds_survived_excluding_ejection_and_death_rounds()
{
    var r = new MatchRecorder();
    r.Apply(Start()); // roster: imp, c1, c2
    // Meeting 1: nobody ejected -> imp, c1, c2 each +1
    r.Apply(new MeetingEnded(null, System.Array.Empty<VoteCast>()));
    // c2 killed during round 2
    r.Apply(new PlayerKilled("imp", "c2", 1000));
    // Meeting 2: imp ejected -> c1 +1 (alive, not ejected); imp gets NO credit (ejected here); c2 dead, no credit
    r.Apply(new MeetingEnded("imp", System.Array.Empty<VoteCast>()));
    r.Apply(new GameEnded(Outcome.CREW_WIN, DateTimeOffset.Parse("2026-06-27T17:15:00Z")));

    var snap = r.Snapshot();
    Assert.Equal(1, snap.Players.Single(p => p.InGameId == "imp").RoundsSurvived); // survived meeting 1 only
    Assert.Equal(2, snap.Players.Single(p => p.InGameId == "c1").RoundsSurvived);  // both meetings
    Assert.Equal(1, snap.Players.Single(p => p.InGameId == "c2").RoundsSurvived);  // meeting 1; dead by meeting 2
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~MatchRecorderTests` (from `game-watcher/`)
Expected: BUILD FAILS — `PlayerTally` has no `RoundsSurvived`.

- [ ] **Step 3: Implement the derivation**

In `MatchRecorder.cs`:

(a) Add the counter to the private `Tally` class (after `public bool Survived = true;`):

```csharp
            public int RoundsSurvived;
```

(b) Credit the round at the **start** of `ApplyMeeting`, before the ejected player is marked dead:

```csharp
        private void ApplyMeeting(MeetingEnded me)
        {
            // Round-survival (spec §10): credit every player who entered this meeting alive and
            // was NOT ejected here. Done before marking the ejected dead so they get no credit
            // for the round they were voted out in; players already dead (Survived=false) get none.
            foreach (var kv in _players)
                if (kv.Value.Survived && kv.Key != me.EjectedInGameId)
                    kv.Value.RoundsSurvived++;

            if (me.EjectedInGameId != null && _players.TryGetValue(me.EjectedInGameId, out var ejected))
                ejected.Survived = false;

            foreach (var vote in me.Votes)
            {
                if (vote.TargetInGameId == null) continue;
                if (!_players.TryGetValue(vote.VoterInGameId, out var voter)) continue;
                if (!_players.TryGetValue(vote.TargetInGameId, out var target)) continue;

                if (target.Role == Role.IMPOSTOR) voter.CorrectShots++;
                else voter.IncorrectShots++;
            }
        }
```

(c) Add `RoundsSurvived` to the `PlayerTally` record (append after `bool Survived`):

```csharp
    public sealed record PlayerTally(
        string InGameId,
        string Name,
        Role Role,
        int Kills,
        int CorrectShots,
        int IncorrectShots,
        int TasksDone,
        int TasksTotal,
        bool Survived,
        int RoundsSurvived);
```

(d) Map it in `Snapshot()` (add the named argument after `Survived: kv.Value.Survived`):

```csharp
                    Survived: kv.Value.Survived,
                    RoundsSurvived: kv.Value.RoundsSurvived))
```

In `MatchBuilder.cs`, pass it into the `Participant` (add after `Survived: p.Survived`):

```csharp
                    Survived: p.Survived,
                    RoundsSurvived: p.RoundsSurvived));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test` (from `game-watcher/`)
Expected: PASS — all existing tests + the new one (no regression in MatchBuilder).

- [ ] **Step 5: Commit**

```bash
git add game-watcher/src/GameWatcher.Core/MatchRecorder.cs game-watcher/src/GameWatcher.Core/MatchBuilder.cs game-watcher/tests/GameWatcher.Core.Tests/MatchRecorderTests.cs
git commit -m "feat(core): derive roundsSurvived from meeting events"
```

---

### Task 3: Derive time-to-kill / time-to-task

**Files:**
- Modify: `game-watcher/src/GameWatcher.Core/MatchRecorder.cs`
- Modify: `game-watcher/src/GameWatcher.Core/MatchBuilder.cs`
- Test: `game-watcher/tests/GameWatcher.Core.Tests/MatchRecorderTests.cs`

**Interfaces:**
- Produces: `PlayerTally(..., int RoundsSurvived, int? TimeToKillMs, int? TimeToTaskMs)` — two nullable fields appended.

- [ ] **Step 1: Write the failing test**

Add to `MatchRecorderTests.cs`:

```csharp
[Fact]
public void Captures_first_kill_and_first_task_times()
{
    var r = new MatchRecorder();
    r.Apply(Start());
    r.Apply(new TasksAssigned("c1", 5));
    r.Apply(new TaskCompleted("c1", 4200));   // first task time
    r.Apply(new TaskCompleted("c1", 9000));   // later — ignored for first-task
    r.Apply(new PlayerKilled("imp", "c2", 12000)); // first kill time
    r.Apply(new PlayerKilled("imp", "c1", 30000)); // later kill — ignored for first-kill
    r.Apply(new GameEnded(Outcome.IMP_WIN, DateTimeOffset.Parse("2026-06-27T17:15:00Z")));

    var snap = r.Snapshot();
    Assert.Equal(12000, snap.Players.Single(p => p.InGameId == "imp").TimeToKillMs);
    Assert.Equal(4200, snap.Players.Single(p => p.InGameId == "c1").TimeToTaskMs);
    Assert.Null(snap.Players.Single(p => p.InGameId == "c2").TimeToKillMs); // never killed anyone
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~MatchRecorderTests`
Expected: BUILD FAILS — `PlayerTally` has no `TimeToKillMs`/`TimeToTaskMs`.

- [ ] **Step 3: Implement the derivation**

In `MatchRecorder.cs`:

(a) Add to the private `Tally` class:

```csharp
            public long? FirstKillAtMs;
            public long? FirstTaskAtMs;
```

(b) Set them in `Apply`. Replace the `TaskCompleted` and `PlayerKilled` cases with:

```csharp
                case TaskCompleted tc when _players.TryGetValue(tc.InGameId, out var t2):
                    t2.TasksDone++;
                    t2.FirstTaskAtMs ??= tc.AtMs;
                    break;
                case PlayerKilled pk:
                    if (_players.TryGetValue(pk.KillerInGameId, out var killer))
                    {
                        killer.Kills++;
                        killer.FirstKillAtMs ??= pk.AtMs;
                    }
                    if (_players.TryGetValue(pk.VictimInGameId, out var victim)) victim.Survived = false;
                    break;
```

(c) Extend `PlayerTally` (append two nullable fields):

```csharp
        bool Survived,
        int RoundsSurvived,
        int? TimeToKillMs,
        int? TimeToTaskMs);
```

(d) Map in `Snapshot()` (replace the closing of the `PlayerTally` construction). Add a local helper at the bottom of the class and use it:

```csharp
                    RoundsSurvived: kv.Value.RoundsSurvived,
                    TimeToKillMs: ToMs(kv.Value.FirstKillAtMs),
                    TimeToTaskMs: ToMs(kv.Value.FirstTaskAtMs)))
```

Add this private static helper inside `MatchRecorder` (after `Snapshot`):

```csharp
        // Game timestamps fit comfortably in int (ms; a match is minutes); clamp defensively.
        private static int? ToMs(long? v) =>
            v is long ms ? (int)System.Math.Min(ms < 0 ? 0 : ms, int.MaxValue) : (int?)null;
```

In `MatchBuilder.cs`, pass them into the `Participant` (replace the `RoundsSurvived` line's tail):

```csharp
                    RoundsSurvived: p.RoundsSurvived,
                    TimeToKillMs: p.TimeToKillMs,
                    TimeToTaskMs: p.TimeToTaskMs));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test` (from `game-watcher/`)
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add game-watcher/src/GameWatcher.Core/MatchRecorder.cs game-watcher/src/GameWatcher.Core/MatchBuilder.cs game-watcher/tests/GameWatcher.Core.Tests/MatchRecorderTests.cs
git commit -m "feat(core): capture first-kill and first-task times"
```

---

### Task 4: `RankedTimer` (pure countdown)

**Files:**
- Create: `game-watcher/src/GameWatcher.Core/RankedTimer.cs`
- Test: `game-watcher/tests/GameWatcher.Core.Tests/RankedTimerTests.cs`

**Interfaces:**
- Produces: `RankedTimer` with `long RemainingMs { get; }`, `bool IsRunning { get; }`, `bool HasExpired { get; }`, `void Reset(long durationMs)`, `void Pause()`, `void Resume()`, `bool Tick(long deltaMs)` (returns `true` exactly once, on the tick that reaches zero). Plan B's `RankedTimerController` drives this.

- [ ] **Step 1: Write the failing test**

Create `game-watcher/tests/GameWatcher.Core.Tests/RankedTimerTests.cs`:

```csharp
using GameWatcher.Core;

namespace GameWatcher.Core.Tests
{
    public class RankedTimerTests
    {
        [Fact]
        public void Partial_tick_does_not_expire()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            Assert.False(t.Tick(400));
            Assert.Equal(600, t.RemainingMs);
            Assert.False(t.HasExpired);
        }

        [Fact]
        public void Crossing_zero_returns_true_exactly_once()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            Assert.False(t.Tick(600));
            Assert.True(t.Tick(600));   // crosses zero
            Assert.False(t.Tick(10));   // already expired
            Assert.True(t.HasExpired);
            Assert.Equal(0, t.RemainingMs);
        }

        [Fact]
        public void Exact_zero_expires()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            Assert.True(t.Tick(1000));
            Assert.True(t.HasExpired);
        }

        [Fact]
        public void Pause_freezes_and_resume_continues()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            t.Pause();
            Assert.False(t.Tick(500));
            Assert.Equal(1000, t.RemainingMs); // frozen
            t.Resume();
            Assert.False(t.Tick(400));
            Assert.Equal(600, t.RemainingMs);
        }

        [Fact]
        public void Pause_and_resume_are_idempotent()
        {
            var t = new RankedTimer();
            t.Reset(1000);
            t.Pause(); t.Pause();
            t.Resume(); t.Resume();
            t.Tick(200);
            Assert.Equal(800, t.RemainingMs);
        }

        [Fact]
        public void No_resurrection_after_expiry()
        {
            var t = new RankedTimer();
            t.Reset(500);
            Assert.True(t.Tick(500));
            t.Resume();
            Assert.False(t.Tick(100));
            Assert.Equal(0, t.RemainingMs);
            Assert.True(t.HasExpired);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~RankedTimerTests`
Expected: BUILD FAILS — `RankedTimer` does not exist.

- [ ] **Step 3: Implement `RankedTimer`**

Create `game-watcher/src/GameWatcher.Core/RankedTimer.cs`:

```csharp
namespace GameWatcher.Core
{
    // Pure, frame-driven countdown for the ranked task deadline (spec §8). The plugin feeds it
    // real elapsed time via Tick and pauses it during meetings. It decides who wins when the crew
    // runs out of time, so its accounting is unit-tested here, away from the game.
    public sealed class RankedTimer
    {
        public long RemainingMs { get; private set; }
        public bool IsRunning { get; private set; }
        public bool HasExpired { get; private set; }

        // Start (or restart) the countdown: running, not expired.
        public void Reset(long durationMs)
        {
            RemainingMs = durationMs < 0 ? 0 : durationMs;
            IsRunning = true;
            HasExpired = false;
        }

        // Stop / resume counting (both idempotent; both no-ops once expired).
        public void Pause() { if (!HasExpired) IsRunning = false; }
        public void Resume() { if (!HasExpired) IsRunning = true; }

        // Advance by deltaMs of real time. Only counts while running. Returns true EXACTLY ONCE,
        // on the tick that reaches zero, so the caller fires the end-game action just once.
        public bool Tick(long deltaMs)
        {
            if (!IsRunning || HasExpired || deltaMs <= 0) return false;
            RemainingMs -= deltaMs;
            if (RemainingMs > 0) return false;
            RemainingMs = 0;
            IsRunning = false;
            HasExpired = true;
            return true;
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~RankedTimerTests`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add game-watcher/src/GameWatcher.Core/RankedTimer.cs game-watcher/tests/GameWatcher.Core.Tests/RankedTimerTests.cs
git commit -m "feat(core): add pure RankedTimer for the task deadline"
```

---

### Task 5: Roster resolution in `LinkManager`

**Files:**
- Modify: `game-watcher/src/GameWatcher.Core/LinkManager.cs`
- Test: `game-watcher/tests/GameWatcher.Core.Tests/RosterResolutionTests.cs`

**Interfaces:**
- Consumes: `IHttpTransport`, `HttpRequestSpec`, `HttpResponse`, `GameWatcherJson` (existing).
- Produces: `public sealed record RosterPlayer(int InGameId, string FriendCode, string? Puid = null, string? InGameName = null)` and `Task<IReadOnlyList<int>> LinkManager.ResolveRosterAsync(IReadOnlyList<RosterPlayer> players, CancellationToken ct = default)` — populates the link map from `matched`, returns `unmatched` in-game ids; on any non-200/parse failure returns ALL ids as unmatched (fail-safe gate) and caches nothing. Link map keys are `inGameId.ToString()` (invariant), matching how the reader formats `inGameId` for events.

- [ ] **Step 1: Write the failing test**

Create `game-watcher/tests/GameWatcher.Core.Tests/RosterResolutionTests.cs`:

```csharp
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
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~RosterResolutionTests`
Expected: BUILD FAILS — `RosterPlayer` / `ResolveRosterAsync` do not exist.

- [ ] **Step 3: Implement roster resolution**

In `LinkManager.cs`, add `using System.Globalization;` and `using System.Linq;` to the usings, then add inside the class:

```csharp
        private const string RosterPath = "/api/lobby/roster";

        // Bulk-resolve a whole lobby by friend code (spec §9 gate). Populates inGameId -> playerId
        // for every matched player and returns the inGameIds we could NOT resolve. On any non-200
        // (bad key, site down) or malformed body, nothing is cached and EVERY player is reported
        // unmatched, so the caller fails safe: a lobby it can't verify is treated as "not all linked".
        public async Task<IReadOnlyList<int>> ResolveRosterAsync(
            IReadOnlyList<RosterPlayer> players, CancellationToken ct = default)
        {
            if (players == null || players.Count == 0) return System.Array.Empty<int>();

            var body = GameWatcherJson.Serialize(new RosterRequest(players));
            var resp = await _transport.SendAsync(new HttpRequestSpec(HttpMethod.Post, RosterPath, body), ct)
                .ConfigureAwait(false);

            if (resp.StatusCode != 200) return players.Select(p => p.InGameId).ToList();

            RosterResponse? parsed;
            try { parsed = GameWatcherJson.Deserialize<RosterResponse>(resp.Body); }
            catch (JsonException) { return players.Select(p => p.InGameId).ToList(); }
            if (parsed == null) return players.Select(p => p.InGameId).ToList();

            foreach (var m in parsed.Matched ?? new System.Collections.Generic.List<RosterMatch>())
                if (!string.IsNullOrEmpty(m.PlayerId))
                    _byInGameId[m.InGameId.ToString(CultureInfo.InvariantCulture)] = m.PlayerId!;

            return parsed.Unmatched ?? new System.Collections.Generic.List<int>();
        }

        private sealed record RosterRequest(IReadOnlyList<RosterPlayer> Players);
        private sealed record RosterMatch(int InGameId, string? PlayerId, string? DisplayName);
        private sealed record RosterResponse(
            IReadOnlyList<RosterMatch>? Matched,
            IReadOnlyList<int>? Unmatched);
```

Add the public input record (top-level in the `GameWatcher.Core` namespace, e.g. just below the `LinkManager` class closing brace, still inside the namespace):

```csharp
    // Lobby roster row the host reads from the game and sends to /api/lobby/roster (spec §9).
    public sealed record RosterPlayer(int InGameId, string FriendCode, string? Puid = null, string? InGameName = null);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test` (from `game-watcher/`)
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add game-watcher/src/GameWatcher.Core/LinkManager.cs game-watcher/tests/GameWatcher.Core.Tests/RosterResolutionTests.cs
git commit -m "feat(core): bulk-resolve lobby roster by friend code"
```

---

### Task 6: Add `roundsSurvived` to the ingest schema

**Files:**
- Modify: `src/lib/ingest/schema.ts`
- Test: `src/lib/ingest/schema.test.ts`

**Interfaces:**
- Produces: `participantSchema` gains `roundsSurvived?: number` (optional, int, ≥0). Optional (not `.default(0)`) so existing typed payload literals in tests/seed don't need editing; consumers read `?? 0`, and the DB column default supplies storage default. Behaviorally identical to the spec's `default(0)` for present values.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/ingest/schema.test.ts`:

```ts
it("accepts roundsSurvived and rejects a negative value", () => {
  const withVal = matchPayloadSchema.safeParse({
    ...validPayload,
    participants: validPayload.participants.map((p, i) => (i === 0 ? { ...p, roundsSurvived: 3 } : p)),
  });
  expect(withVal.success).toBe(true);
  if (withVal.success) expect(withVal.data.participants[0].roundsSurvived).toBe(3);

  const negative = matchPayloadSchema.safeParse({
    ...validPayload,
    participants: validPayload.participants.map((p, i) => (i === 0 ? { ...p, roundsSurvived: -1 } : p)),
  });
  expect(negative.success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema` (from repo root)
Expected: FAIL — `roundsSurvived` is stripped (undefined) / negative not rejected.

- [ ] **Step 3: Add the field**

In `src/lib/ingest/schema.ts`, add to `participantSchema` after the `survived` line:

```ts
  survived: z.boolean().default(true),
  roundsSurvived: z.number().int().min(0).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/schema.ts src/lib/ingest/schema.test.ts
git commit -m "feat(ingest): accept roundsSurvived in the match schema"
```

---

### Task 7: Prisma migration for `MatchParticipant.roundsSurvived`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_rounds_survived/migration.sql` (generated)

**Interfaces:**
- Produces: `MatchParticipant.roundsSurvived` column (`Int`, default 0), available on the Prisma client.

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, in `model MatchParticipant`, add after the `survived` line:

```prisma
  survived       Boolean @default(true)
  roundsSurvived Int     @default(0)
```

- [ ] **Step 2: Generate and apply the migration**

Run (from repo root, with `DATABASE_URL` pointing at the dev/test Postgres):

```bash
npx prisma migrate dev --name add_rounds_survived
```

Expected: a new migration folder is created, applied to the DB, and the Prisma client regenerates. Output ends with "Your database is now in sync with your schema."

- [ ] **Step 3: Verify the build and existing tests still pass**

Run: `npx prisma generate && npm test -- processMatch`
Expected: PASS (existing `processMatch` tests unaffected; the new column defaults to 0).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add MatchParticipant.roundsSurvived"
```

---

### Task 8: `roundsSurvived` in the ELO performance model

**Files:**
- Modify: `src/lib/elo/perf.ts`
- Test: `src/lib/elo/elo.test.ts`

**Interfaces:**
- Consumes: `roundsSurvived?: number` on the participant.
- Produces: `PerfStats` gains optional `roundsSurvived?: number`; `computePerf("IMPOSTOR", ...)` increases with `roundsSurvived` (capped). **Weights are owner-tunable** — the default below is a sensible starting point.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/elo/elo.test.ts` inside the `describe("computePerf", ...)` block:

```ts
it("rewards an impostor who survives more rounds", () => {
  const base = { kills: 1, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true };
  const few = computePerf("IMPOSTOR", { ...base, roundsSurvived: 0 });
  const many = computePerf("IMPOSTOR", { ...base, roundsSurvived: 4 });
  expect(many).toBeGreaterThan(few);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- elo`
Expected: FAIL — `roundsSurvived` not in `PerfStats` / not used (`many === few`).

- [ ] **Step 3: Implement the weighting**

In `src/lib/elo/perf.ts`, add `roundsSurvived` to `PerfStats`:

```ts
export type PerfStats = {
  kills: number; correctShots: number; incorrectShots: number;
  tasksDone: number; tasksTotal: number;
  timeToKillMs?: number; timeToTaskMs?: number; survived: boolean;
  roundsSurvived?: number;
};
```

Replace the `IMPOSTOR` branch of `computePerf` with:

```ts
  if (role === "IMPOSTOR") {
    const killScore = s.kills * 0.25;                       // each kill helps
    const speed = s.timeToKillMs ? clamp((30000 - s.timeToKillMs) / 30000) * 0.3 : 0;
    // "rounds not voted out": reward staying hidden across meetings (spec §10).
    // OWNER-TUNABLE: ROUNDS_CAP and PER_ROUND set how much hiding matters.
    const ROUNDS_CAP = 4, PER_ROUND = 0.06;
    const hiding = Math.min(s.roundsSurvived ?? 0, ROUNDS_CAP) * PER_ROUND;
    const survival = s.survived ? 0.15 : -0.15;
    return clamp(killScore + speed + hiding + survival);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- elo`
Expected: PASS (including the existing "stays within [-1,1]" clamp test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/elo/perf.ts src/lib/elo/elo.test.ts
git commit -m "feat(elo): reward impostor rounds-survived in computePerf"
```

---

### Task 9: Persist `roundsSurvived` and return per-player ELO deltas

**Files:**
- Modify: `src/lib/ingest/processMatch.ts`
- Test: `src/lib/ingest/processMatch.test.ts`

**Interfaces:**
- Consumes: `roundsSurvived?: number` on participants; `computePerf` from Task 8.
- Produces: `processMatch(payload): Promise<{ matchId: string; results: MatchResult[] }>` where `MatchResult = { playerId: string; role: "CREW" | "IMPOSTOR"; eloBefore: number; eloAfter: number; eloDelta: number }`. The `/api/ingest/match` route already returns this object verbatim (`NextResponse.json(result)`), so no route change is needed.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/ingest/processMatch.test.ts`:

```ts
it("persists roundsSurvived and returns per-player elo deltas", async () => {
  const imp = await makePlayer("imp-rs");
  const crew = await makePlayer("crew-rs");
  const res = await processMatch({
    matchCode: "RS-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    outcome: "IMP_WIN",
    participants: [
      { playerId: imp.id, role: "IMPOSTOR", won: true, kills: 2, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true, roundsSurvived: 3 },
      { playerId: crew.id, role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false, roundsSurvived: 1 },
    ],
  });

  expect(res.results).toHaveLength(2);
  const impResult = res.results.find((r) => r.playerId === imp.id)!;
  expect(impResult.eloDelta).toBeGreaterThan(0);

  const mp = await prisma.matchParticipant.findFirst({ where: { match: { code: "RS-1" }, role: "IMPOSTOR" } });
  expect(mp!.roundsSurvived).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- processMatch`
Expected: FAIL — `res.results` is undefined and `roundsSurvived` is not persisted.

- [ ] **Step 3: Implement persistence + delta return**

In `src/lib/ingest/processMatch.ts`:

(a) Add the result type above `processMatch`:

```ts
export type MatchResult = {
  playerId: string;
  role: "CREW" | "IMPOSTOR";
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
};
```

(b) Change both signatures/early-returns to carry `results`:

```ts
export async function processMatch(payload: MatchPayload): Promise<{ matchId: string; results: MatchResult[] }> {
  const existing = await prisma.match.findUnique({ where: { code: payload.matchCode } });
  if (existing) return { matchId: existing.id, results: [] };
```

(c) Inside the `$transaction`, declare a collector before the `for` loop:

```ts
      const results: MatchResult[] = [];
```

(d) Persist `roundsSurvived` in the `matchParticipant.create` data (add after `survived: p.survived,`):

```ts
            survived: p.survived,
            roundsSurvived: p.roundsSurvived ?? 0,
```

(e) Record the delta right after the `matchParticipant.create(...)` call:

```ts
        results.push({ playerId: player.id, role: p.role, eloBefore: rating, eloAfter, eloDelta });
```

(f) Return both from the transaction:

```ts
      return { matchId: match.id, results };
```

(g) Update the race-recovery `catch` early return:

```ts
      if (raced) return { matchId: raced.id, results: [] };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- processMatch`
Expected: PASS — new test plus all existing `processMatch` tests (which ignore the new `results` field).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/processMatch.ts src/lib/ingest/processMatch.test.ts
git commit -m "feat(ingest): persist roundsSurvived and return per-player elo deltas"
```

---

## Final verification

- [ ] **Core:** from `game-watcher/`, run `dotnet test` → all tests green (59 existing + new for Tasks 1–5), 0 warnings.
- [ ] **Website:** from repo root, run `npm test` → all vitest suites green (with `DATABASE_URL` set).
- [ ] **Contract parity:** the brain's `SerializationTests` plus the website `schema.test.ts` both exercise `roundsSurvived`, confirming the camelCase wire field lines up end-to-end.

## Notes for Plan B (the plugin)

- The reader must format `inGameId` consistently as `PlayerControl.PlayerId.ToString()` (invariant) for BOTH events and roster rows, so `ResolveRosterAsync`'s cached keys match event keys.
- `RankedTimer.Tick` returns `true` exactly once — wire the force-end there.
- `processMatch` now returns `results` (per-player `eloDelta`) for the post-game chat announcement.
- `roundsSurvived` and time-to-* are derived in the brain from existing events — the reader emits no new event for them.
