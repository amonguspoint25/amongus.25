# Provisional Ratings + Min-Games Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the leaderboard so only players who've played enough games in a role appear ranked, show the rest in a "provisional" section, and converge provisional ratings faster with a higher K-factor.

**Architecture:** A single pure placement module defines the threshold, the provisional test, and the K-factor, and is reused by the write path (ELO math), the read path (leaderboard gating), and the UI (badges). Two per-role game counters are added to `Player` and backfilled from match history.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + Postgres (Neon), Vitest, TypeScript.

## Global Constraints

- `PLACEMENT_GAMES = 10` (per-role threshold), `K_PLACEMENT = 64`, `K_NORMAL = 32` — exact values, defined once in `src/lib/elo/placement.ts`.
- Per-role counting: Crew board gates on `crewGames`, Impostor on `impGames`, Overall on total `games`.
- K-factor is chosen from the role's game count **before** the current match's increment.
- The K change applies to future matches only — no historical replay.
- TDD for pure logic and the write path (repo convention: pure logic + DB-backed `processMatch` tests). UI is verified manually on the running dev server; the repo has no component tests.
- DB-backed tests run against the Neon test branch (`vitest.setup.ts` points `DATABASE_URL` at `TEST_DIRECT_URL`/`TEST_DATABASE_URL`). Run all tests with `npx vitest run`.
- Spec: `docs/superpowers/specs/2026-06-24-provisional-ratings-design.md`.

---

## File Structure

- `src/lib/elo/placement.ts` (new) — threshold + `kForGames` + `isProvisional`. Pure.
- `src/lib/elo/placement.test.ts` (new) — unit tests for the above.
- `prisma/schema.prisma` (modify) — add `crewGames`, `impGames` to `Player`.
- `prisma/migrations/<ts>_add_provisional_role_games/migration.sql` (new) — columns + backfill.
- `src/lib/ingest/processMatch.ts` (modify) — K selection + per-role increments.
- `src/lib/ingest/processMatch.test.ts` (modify) — add K-factor + counter tests.
- `src/lib/leaderboard.ts` (new) — pure `gamesInRoleFor` + `partitionProvisional`.
- `src/lib/leaderboard.test.ts` (new) — unit tests for partition logic.
- `src/lib/players.ts` (modify) — add `rankedOverallWhere`.
- `src/app/api/leaderboard/route.ts` (modify) — return `{ ranked, provisional }`.
- `src/components/LeaderboardTable.tsx` (modify) — render provisional section.
- `src/app/page.tsx` (modify) — home top-5 filters to overall-ranked.
- `src/app/players/[id]/page.tsx` (modify) — provisional badge.

---

## Task 1: Placement module

**Files:**
- Create: `src/lib/elo/placement.ts`
- Test: `src/lib/elo/placement.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PLACEMENT_GAMES: number` (= 10), `K_PLACEMENT: number` (= 64), `K_NORMAL: number` (= 32)
  - `kForGames(roleGames: number): number`
  - `isProvisional(roleGames: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/elo/placement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kForGames, isProvisional, PLACEMENT_GAMES, K_PLACEMENT, K_NORMAL } from "./placement";

describe("kForGames", () => {
  it("uses placement K below the threshold", () => {
    expect(kForGames(0)).toBe(K_PLACEMENT);
    expect(kForGames(PLACEMENT_GAMES - 1)).toBe(K_PLACEMENT);
  });
  it("uses normal K at and above the threshold", () => {
    expect(kForGames(PLACEMENT_GAMES)).toBe(K_NORMAL);
    expect(kForGames(PLACEMENT_GAMES + 5)).toBe(K_NORMAL);
  });
});

describe("isProvisional", () => {
  it("is true below the threshold", () => {
    expect(isProvisional(0)).toBe(true);
    expect(isProvisional(PLACEMENT_GAMES - 1)).toBe(true);
  });
  it("is false at and above the threshold", () => {
    expect(isProvisional(PLACEMENT_GAMES)).toBe(false);
    expect(isProvisional(PLACEMENT_GAMES + 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/elo/placement.test.ts`
Expected: FAIL — cannot resolve `./placement`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/elo/placement.ts`:

```ts
// Number of games (per role) a player must complete before they appear on the
// ranked leaderboard for that role. During this window their rating uses a larger
// K-factor so it converges quickly toward their true skill ("placements").
export const PLACEMENT_GAMES = 10;
export const K_PLACEMENT = 64;
export const K_NORMAL = 32;

export function kForGames(roleGames: number): number {
  return roleGames < PLACEMENT_GAMES ? K_PLACEMENT : K_NORMAL;
}

export function isProvisional(roleGames: number): boolean {
  return roleGames < PLACEMENT_GAMES;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/elo/placement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/elo/placement.ts src/lib/elo/placement.test.ts
git commit -m "feat(elo): placement threshold, K-factor, and provisional helpers"
```

---

## Task 2: Schema + migration + backfill

**Files:**
- Modify: `prisma/schema.prisma` (Player model)
- Create: `prisma/migrations/<timestamp>_add_provisional_role_games/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Player.crewGames: Int` and `Player.impGames: Int` (both default 0), populated for existing rows.

- [ ] **Step 1: Add the fields to the schema**

In `prisma/schema.prisma`, in the `Player` model, immediately after the `games Int @default(0)` line, add:

```prisma
  crewGames      Int                @default(0)
  impGames       Int                @default(0)
```

- [ ] **Step 2: Generate the migration without applying it**

Run: `npx prisma migrate dev --create-only --name add_provisional_role_games`
Expected: a new folder under `prisma/migrations/` containing `migration.sql` with two `ALTER TABLE "Player" ADD COLUMN ...` statements.

- [ ] **Step 3: Append the backfill to the generated migration**

Open the new `prisma/migrations/<timestamp>_add_provisional_role_games/migration.sql` and append these statements after the existing `ALTER TABLE` lines:

```sql
-- Backfill per-role game counts from the source of truth (match participations).
UPDATE "Player" p SET "crewGames" = sub.c
FROM (
  SELECT "playerId", count(*)::int AS c
  FROM "MatchParticipant"
  WHERE "role"::text = 'CREW'
  GROUP BY "playerId"
) sub
WHERE p.id = sub."playerId";

UPDATE "Player" p SET "impGames" = sub.c
FROM (
  SELECT "playerId", count(*)::int AS c
  FROM "MatchParticipant"
  WHERE "role"::text = 'IMPOSTOR'
  GROUP BY "playerId"
) sub
WHERE p.id = sub."playerId";
```

- [ ] **Step 4: Apply the migration to the dev database**

Run: `npx prisma migrate dev`
Expected: migration applies cleanly; Prisma Client regenerates with `crewGames`/`impGames`.

- [ ] **Step 5: Apply the migration to the test database**

The DB tests run against the Neon test branch. Apply the same migration there so later tasks' tests see the new columns:

Run: `DIRECT_URL="$TEST_DIRECT_URL" DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy`
Expected: "All migrations have been successfully applied." (If `TEST_*` env vars are unset, set them from `.env` first — the test branch must be migrated before Task 3.)

- [ ] **Step 6: Verify the backfill is correct**

Run:
```bash
npx prisma studio
```
In the `Player` table, confirm `crewGames + impGames == games` for a few seeded players (every participation is exactly one role). Close Studio.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): per-role game counters with backfill from match history"
```

---

## Task 3: Write path — K-factor + per-role increments

**Files:**
- Modify: `src/lib/ingest/processMatch.ts`
- Test: `src/lib/ingest/processMatch.test.ts`

**Interfaces:**
- Consumes: `kForGames` (Task 1); `Player.crewGames`/`Player.impGames` (Task 2); existing `updateRating({ rating, opponentAvg, won, perf, k? })`.
- Produces: no new exports; behavioral change — placements use K=64, and per-role counters increment.

- [ ] **Step 1: Write the failing tests**

In `src/lib/ingest/processMatch.test.ts`, add `computePerf` and `updateRating` to imports at the top:

```ts
import { computePerf } from "../elo/perf";
import { updateRating } from "../elo/update";
```

Then add these two tests inside the `describe("processMatch", ...)` block:

```ts
  it("increments only the played role's counter (and total games)", async () => {
    const imp = await makePlayer("imp-roles");
    const crew = await makePlayer("crew-roles");
    await processMatch({
      matchCode: "ROLES-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: "IMP_WIN",
      participants: [
        { discordId: "imp-roles", role: "IMPOSTOR", won: true, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-roles", role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false },
      ],
    });
    const i = await prisma.player.findUnique({ where: { id: imp.id } });
    const c = await prisma.player.findUnique({ where: { id: crew.id } });
    expect(i!.impGames).toBe(1);
    expect(i!.crewGames).toBe(0);
    expect(i!.games).toBe(1);
    expect(c!.crewGames).toBe(1);
    expect(c!.impGames).toBe(0);
  });

  it("applies the placement K-factor (64) for a player's first game in a role", async () => {
    await makePlayer("imp-k");
    await makePlayer("crew-k");
    const res = await processMatch({
      matchCode: "K-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: "IMP_WIN",
      participants: [
        { discordId: "imp-k", role: "IMPOSTOR", won: true, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-k", role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false },
      ],
    });
    // Both players start at 1000, so the impostor's opponentAvg is 1000.
    const perf = computePerf("IMPOSTOR", { kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true });
    const expected = updateRating({ rating: 1000, opponentAvg: 1000, won: true, perf, k: 64 });
    const mp = await prisma.matchParticipant.findFirst({ where: { match: { code: "K-1" }, role: "IMPOSTOR" } });
    expect(mp!.eloDelta).toBeCloseTo(expected.eloDelta, 5);
    expect(res.matchId).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ingest/processMatch.test.ts`
Expected: FAIL — `impGames` is `undefined`/absent and `eloDelta` reflects K=32 (≈16+perf bonus), not K=64.

- [ ] **Step 3: Implement K selection and per-role increments**

In `src/lib/ingest/processMatch.ts`:

Add the import near the top (with the other `../elo` imports):

```ts
import { kForGames } from "../elo/placement";
```

In the participant loop, replace the rating/update lines. Change:

```ts
        const rating = isImp ? player.impElo : player.crewElo;
        const opponentAvg = isImp ? crewAvg : impAvg;
        const perf = computePerf(p.role, p);
        const { eloAfter, eloDelta } = updateRating({ rating, opponentAvg, won: p.won, perf });
```

to:

```ts
        const rating = isImp ? player.impElo : player.crewElo;
        const opponentAvg = isImp ? crewAvg : impAvg;
        const perf = computePerf(p.role, p);
        const roleGames = isImp ? player.impGames : player.crewGames;
        const k = kForGames(roleGames);
        const { eloAfter, eloDelta } = updateRating({ rating, opponentAvg, won: p.won, perf, k });
```

Then in the `tx.player.update` `data` object, add the two per-role increments next to `games: { increment: 1 }`:

```ts
            games: { increment: 1 },
            crewGames: { increment: isImp ? 0 : 1 },
            impGames: { increment: isImp ? 1 : 0 },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ingest/processMatch.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/processMatch.ts src/lib/ingest/processMatch.test.ts
git commit -m "feat(ingest): placement K-factor and per-role game counting"
```

---

## Task 4: Leaderboard partition helpers (pure)

**Files:**
- Create: `src/lib/leaderboard.ts`
- Test: `src/lib/leaderboard.test.ts`

**Interfaces:**
- Consumes: `isProvisional`, `PLACEMENT_GAMES` (Task 1).
- Produces:
  - `type LeaderboardSort = "overall" | "crew" | "imp"`
  - `type PlayerRow = { id: string; name: string; crewElo: number; impElo: number; overallElo: number; games: number; crewGames: number; impGames: number }`
  - `type LeaderboardRow = { id: string; name: string; crewElo: number; impElo: number; overallElo: number; games: number; gamesInRole: number; needed: number }`
  - `gamesInRoleFor(row: PlayerRow, sort: LeaderboardSort): number`
  - `eloForSort(row: { crewElo: number; impElo: number; overallElo: number }, sort: LeaderboardSort): number`
  - `partitionProvisional(rows: PlayerRow[], sort: LeaderboardSort): { ranked: LeaderboardRow[]; provisional: LeaderboardRow[] }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/leaderboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { partitionProvisional, gamesInRoleFor, type PlayerRow } from "./leaderboard";

function row(over: Partial<PlayerRow>): PlayerRow {
  return { id: "x", name: "x", crewElo: 1000, impElo: 1000, overallElo: 1000, games: 0, crewGames: 0, impGames: 0, ...over };
}

describe("gamesInRoleFor", () => {
  it("selects the role-relevant counter", () => {
    const r = row({ games: 30, crewGames: 12, impGames: 3 });
    expect(gamesInRoleFor(r, "overall")).toBe(30);
    expect(gamesInRoleFor(r, "crew")).toBe(12);
    expect(gamesInRoleFor(r, "imp")).toBe(3);
  });
});

describe("partitionProvisional", () => {
  it("splits ranked vs provisional by the active role and keeps ranked input order", () => {
    const rows = [
      row({ id: "a", name: "A", crewElo: 1200, crewGames: 15 }),
      row({ id: "b", name: "B", crewElo: 1100, crewGames: 4 }),
      row({ id: "c", name: "C", crewElo: 1050, crewGames: 20 }),
    ];
    const { ranked, provisional } = partitionProvisional(rows, "crew");
    expect(ranked.map((r) => r.id)).toEqual(["a", "c"]);
    expect(provisional.map((r) => r.id)).toEqual(["b"]);
    expect(provisional[0].gamesInRole).toBe(4);
    expect(provisional[0].needed).toBe(10);
  });

  it("orders provisional by progress (closest to qualifying first), then ELO", () => {
    const rows = [
      row({ id: "p1", name: "P1", impElo: 980, impGames: 3 }),
      row({ id: "p2", name: "P2", impElo: 1040, impGames: 7 }),
      row({ id: "p3", name: "P3", impElo: 1010, impGames: 7 }),
    ];
    const { provisional } = partitionProvisional(rows, "imp");
    // 7 games before 3 games; within 7, higher imp ELO first.
    expect(provisional.map((r) => r.id)).toEqual(["p2", "p3", "p1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: FAIL — cannot resolve `./leaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/leaderboard.ts`:

```ts
import { isProvisional, PLACEMENT_GAMES } from "./elo/placement";

export type LeaderboardSort = "overall" | "crew" | "imp";

export type PlayerRow = {
  id: string;
  name: string;
  crewElo: number;
  impElo: number;
  overallElo: number;
  games: number;
  crewGames: number;
  impGames: number;
};

export type LeaderboardRow = {
  id: string;
  name: string;
  crewElo: number;
  impElo: number;
  overallElo: number;
  games: number;
  gamesInRole: number;
  needed: number;
};

export function gamesInRoleFor(row: PlayerRow, sort: LeaderboardSort): number {
  if (sort === "crew") return row.crewGames;
  if (sort === "imp") return row.impGames;
  return row.games;
}

export function eloForSort(
  row: { crewElo: number; impElo: number; overallElo: number },
  sort: LeaderboardSort,
): number {
  if (sort === "crew") return row.crewElo;
  if (sort === "imp") return row.impElo;
  return row.overallElo;
}

function toRow(row: PlayerRow, sort: LeaderboardSort): LeaderboardRow {
  return {
    id: row.id,
    name: row.name,
    crewElo: row.crewElo,
    impElo: row.impElo,
    overallElo: row.overallElo,
    games: row.games,
    gamesInRole: gamesInRoleFor(row, sort),
    needed: PLACEMENT_GAMES,
  };
}

// `rows` is assumed already sorted by the active field (ELO desc). Ranked rows keep
// that order; provisional rows are re-sorted so the players closest to qualifying
// (most games in the role) come first, tie-broken by the active ELO.
export function partitionProvisional(
  rows: PlayerRow[],
  sort: LeaderboardSort,
): { ranked: LeaderboardRow[]; provisional: LeaderboardRow[] } {
  const ranked: LeaderboardRow[] = [];
  const provisional: LeaderboardRow[] = [];
  for (const r of rows) {
    (isProvisional(gamesInRoleFor(r, sort)) ? provisional : ranked).push(toRow(r, sort));
  }
  provisional.sort(
    (a, b) =>
      b.gamesInRole - a.gamesInRole ||
      eloForSort(b, sort) - eloForSort(a, sort),
  );
  return { ranked, provisional };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/leaderboard.test.ts
git commit -m "feat(leaderboard): pure ranked/provisional partition helpers"
```

---

## Task 5: Leaderboard API + ranked-where helper

**Files:**
- Modify: `src/lib/players.ts`
- Modify: `src/app/api/leaderboard/route.ts`

**Interfaces:**
- Consumes: `partitionProvisional`, `LeaderboardSort` (Task 4); `isProvisional`/`PLACEMENT_GAMES` indirectly; `realPlayersWhere` (existing).
- Produces:
  - `rankedOverallWhere: Prisma.PlayerWhereInput` in `players.ts`
  - `/api/leaderboard` response shape `{ ranked: LeaderboardRow[]; provisional: LeaderboardRow[] }`.

- [ ] **Step 1: Add the ranked-overall filter to `players.ts`**

In `src/lib/players.ts`, add the import and the helper:

```ts
import { PLACEMENT_GAMES } from "./elo/placement";
```

```ts
/**
 * Restricts to real players who have completed enough total games to be "ranked"
 * overall (used by the home #rankings preview). Provisional players are excluded.
 */
export const rankedOverallWhere: Prisma.PlayerWhereInput = {
  ...realPlayersWhere,
  games: { gte: PLACEMENT_GAMES },
};
```

- [ ] **Step 2: Rewrite the leaderboard route to split ranked/provisional**

Replace the entire body of `src/app/api/leaderboard/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { realPlayersWhere } from "@/lib/players";
import { partitionProvisional, type LeaderboardSort, type PlayerRow } from "@/lib/leaderboard";

export async function GET(req: NextRequest) {
  const sortParam = req.nextUrl.searchParams.get("sort") ?? "overall";
  const sort: LeaderboardSort = sortParam === "crew" ? "crew" : sortParam === "imp" ? "imp" : "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";

  const players = await prisma.player.findMany({
    where: realPlayersWhere,
    orderBy: { [field]: "desc" },
    take: 100,
  });

  const rows: PlayerRow[] = players.map((p) => ({
    id: p.id,
    name: p.displayName,
    crewElo: Math.round(p.crewElo),
    impElo: Math.round(p.impElo),
    overallElo: Math.round(p.overallElo),
    games: p.games,
    crewGames: p.crewGames,
    impGames: p.impGames,
  }));

  return NextResponse.json(partitionProvisional(rows, sort));
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the route and helper types line up).

- [ ] **Step 4: Smoke-test the endpoint**

With the dev server running (`npm run dev`), run:
```bash
curl -s "http://localhost:3000/api/leaderboard?sort=overall" | head -c 400
```
Expected: JSON beginning `{"ranked":[...],"provisional":[...]}`. Seeded demo players (40 matches across 12 players) should put most in `ranked`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/players.ts src/app/api/leaderboard/route.ts
git commit -m "feat(leaderboard): API returns ranked + provisional, add rankedOverallWhere"
```

---

## Task 6: Leaderboard table — provisional section

**Files:**
- Modify: `src/components/LeaderboardTable.tsx`

**Interfaces:**
- Consumes: `/api/leaderboard` `{ ranked, provisional }` shape (Task 5).
- Produces: no exports change.

- [ ] **Step 1: Update the row type and fetch state**

In `src/components/LeaderboardTable.tsx`, replace the `Row` type and the `rows` state with split state. Change:

```ts
type Row = { id: string; name: string; crewElo: number; impElo: number; overallElo: number; games: number };
```

to:

```ts
type Row = {
  id: string; name: string;
  crewElo: number; impElo: number; overallElo: number;
  games: number; gamesInRole: number; needed: number;
};
```

Change the state declaration:

```ts
  const [rows, setRows] = useState<Row[]>([]);
```

to:

```ts
  const [ranked, setRanked] = useState<Row[]>([]);
  const [provisional, setProvisional] = useState<Row[]>([]);
```

- [ ] **Step 2: Update the fetch effect**

Replace the `load` function inside the `useEffect` so it consumes the new shape:

```ts
    const load = () =>
      fetch(`/api/leaderboard?sort=${sort}`)
        .then((r) => r.json())
        .then((d) => {
          if (!on) return;
          setRanked(d.ranked ?? []);
          setProvisional(d.provisional ?? []);
        });
```

- [ ] **Step 3: Update the filtered rows + table body**

Replace the `filteredRows` definition:

```ts
  const filteredRows = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );
```

with two filtered lists:

```ts
  const matches = (r: Row) => r.name.toLowerCase().includes(search.toLowerCase());
  const filteredRanked = ranked.filter(matches);
  const filteredProvisional = provisional.filter(matches);
```

Then in the `<tbody>`, replace `filteredRows.map(...)` with `filteredRanked.map(...)` (same row markup as today), and replace the two empty-state conditionals so they reference the new lists:

```tsx
          {filteredRanked.length === 0 && ranked.length > 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No operatives match.</td>
            </tr>
          )}
          {ranked.length === 0 && provisional.length === 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No players yet.</td>
            </tr>
          )}
          {ranked.length === 0 && provisional.length > 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No ranked operatives yet — placements in progress.</td>
            </tr>
          )}
```

- [ ] **Step 4: Add the provisional section after the table**

Immediately after the closing `</table>` and before the `// LIVE · REFRESH 15s` paragraph, add:

```tsx
      {filteredProvisional.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <p className="eyebrow mb-2" style={{ color: "var(--muted)" }}>
            // PROVISIONAL · NEED {filteredProvisional[0].needed} GAMES
          </p>
          <div className="grid gap-1">
            {filteredProvisional.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-3 py-2"
                style={{ border: "1px solid var(--line)", color: "var(--muted)", opacity: 0.85 }}
              >
                <Link
                  href={`/players/${r.id}`}
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  {r.name}
                </Link>
                <span className="data" style={{ fontSize: "0.8rem" }}>
                  {r.gamesInRole}/{r.needed} games
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

With `npm run dev` running, open `http://localhost:3000/leaderboard`. Confirm: the ranked table renders as before; switching the OVERALL/CREW/IMP tabs re-splits; if any seeded player is below 10 games in a role, a "PROVISIONAL · NEED 10 GAMES" section lists them with `x/10 games`. (To force a provisional row, you can view the CREW or IMP tab — players with few games in that specific role will drop into provisional.)

- [ ] **Step 7: Commit**

```bash
git add src/components/LeaderboardTable.tsx
git commit -m "feat(ui): leaderboard provisional section with placement progress"
```

---

## Task 7: Home rankings — ranked-only preview

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `rankedOverallWhere` (Task 5).
- Produces: no exports change.

- [ ] **Step 1: Swap the top-5 filter**

In `src/app/page.tsx`, update the import from `@/lib/rank`/players. Change:

```ts
import { realPlayersWhere } from "@/lib/players";
```

to:

```ts
import { realPlayersWhere, rankedOverallWhere } from "@/lib/players";
```

Then in the `Promise.all`, change the `topPlayers` query from:

```ts
    prisma.player.findMany({ where: realPlayersWhere, orderBy: { overallElo: "desc" }, take: 5 }),
```

to:

```ts
    prisma.player.findMany({ where: rankedOverallWhere, orderBy: { overallElo: "desc" }, take: 5 }),
```

(`realPlayersWhere` is still used by the `playerCount` query below, so keep the import.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify in the browser**

With `npm run dev` running, open `http://localhost:3000/` and scroll to the `#rankings` section. Confirm only ranked players (≥10 total games) appear; if fewer than 5 qualify, fewer show, and the "No operatives ranked yet." message appears only when none qualify.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): home rankings preview shows only ranked players"
```

---

## Task 8: Player profile — provisional badge

**Files:**
- Modify: `src/app/players/[id]/page.tsx`

**Interfaces:**
- Consumes: `PLACEMENT_GAMES` (Task 1).
- Produces: no exports change.

- [ ] **Step 1: Import the threshold and compute provisional status**

In `src/app/players/[id]/page.tsx`, add the import:

```ts
import { PLACEMENT_GAMES } from "@/lib/elo/placement";
```

After the existing `const tier = tierFor(p.overallElo);` line, add:

```ts
  const provisional = p.games < PLACEMENT_GAMES;
```

- [ ] **Step 2: Show the badge near the tier**

In the tier row (`<div className="mt-2 flex items-center gap-3">`), replace the inner `<span>...</span>` that renders the tier name + overall with a conditional that shows a provisional badge instead of the tier name when provisional:

```tsx
        <span>
          {provisional ? (
            <span
              className="eyebrow"
              style={{ color: "var(--muted)", border: "1px solid var(--line)", padding: "2px 8px" }}
            >
              PROVISIONAL · {p.games}/{PLACEMENT_GAMES} placements
            </span>
          ) : (
            <span style={{ color: isTopImpostor ? "var(--alert)" : "var(--signal)" }}>{tier.name}</span>
          )}
          {" · "}Overall{" "}
          <span className="glow-num">
            <CountUp value={Math.round(p.overallElo)} />
          </span>
        </span>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

With `npm run dev` running, open a profile for a player with <10 total games (`/players/<id>`). Confirm the `PROVISIONAL · x/10 placements` badge replaces the tier name; open a player with ≥10 games and confirm the normal tier name still shows.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (placement, leaderboard, elo, ingest, bracket, tournament, serverAuth, schema).

- [ ] **Step 6: Commit**

```bash
git add src/app/players/[id]/page.tsx
git commit -m "feat(ui): provisional badge on player profile"
```

---

## Final Verification

- [ ] `npx vitest run` — all green.
- [ ] `npm run build` — production build succeeds (no type or lint errors).
- [ ] Manual: leaderboard tabs split ranked/provisional; home preview ranked-only; provisional profile badge shows.
