# Season System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurring competitive seasons with per-season Elo ladders, a ×0.5 soft reset between seasons, browsable past-season standings, and a preserved all-time board.

**Architecture:** Season ratings are stored per season (new `PlayerSeason` rows) because Elo is stateful and can't be derived by date-filtering. A `Season` table tracks periods (one active). Match ingest writes the active season's rating and lazily creates a player's season row with a soft-reset seed; it also keeps `Player` lifetime counters + a cumulative career Elo for the all-time board. Admin rolls seasons over manually.

**Tech Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL (Neon), Auth.js v5, vitest.

## Global Constraints

- Soft-reset factor is **0.5**: `seed = 1000 + (prevElo − 1000) × 0.5`; brand-new player seeds at **1000**.
- Baseline rating is **1000** (matches existing `@default(1000)` and `avg()` fallback).
- Exactly **one active season** at a time (active = `endedAt == null`).
- All season admin controls are gated by `requireAdmin()` (from `@/lib/admin`).
- Real-players filter excludes demo users: `discordId` NOT starting with `"demo-"` (existing `realPlayersWhere`).
- Placement is **per role, 10 games** (`PLACEMENT_GAMES`), now evaluated against per-season game counts.
- Prisma composite-unique accessor for `@@unique([playerId, seasonId])` is `playerId_seasonId`.
- Migrations are applied with `npx prisma migrate deploy` (uses `DIRECT_URL` via `prisma.config.ts`); the build runs `prisma generate && next build`.
- Integration tests that touch the DB MUST run against the test Postgres (the project's `TEST_DATABASE_URL` / local test cluster), never prod Neon. Pure unit tests need no DB.
- Attribution is disabled globally — commit messages omit any Claude co-author line.

---

### Task 1: Schema — Season, PlayerSeason, Match.seasonId

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260627020000_season_system/migration.sql`

**Interfaces:**
- Produces: Prisma models `Season`, `PlayerSeason`; `Match.seasonId`; relations `Player.seasons`, `Season.matches`, `Season.playerSeasons`.

- [ ] **Step 1: Add models to `prisma/schema.prisma`**

Add these two models (place after the `Player` model) and the relation/field edits below:

```prisma
model Season {
  id            String         @id @default(cuid())
  number        Int            @unique
  startedAt     DateTime       @default(now())
  endedAt       DateTime?
  createdAt     DateTime       @default(now())
  playerSeasons PlayerSeason[]
  matches       Match[]
}

model PlayerSeason {
  id             String   @id @default(cuid())
  player         Player   @relation(fields: [playerId], references: [id])
  playerId       String
  season         Season   @relation(fields: [seasonId], references: [id])
  seasonId       String
  crewElo        Float    @default(1000)
  impElo         Float    @default(1000)
  overallElo     Float    @default(1000)
  games          Int      @default(0)
  crewGames      Int      @default(0)
  impGames       Int      @default(0)
  kills          Int      @default(0)
  correctShots   Int      @default(0)
  incorrectShots Int      @default(0)
  tasksDone      Int      @default(0)
  crewWins       Int      @default(0)
  impWins        Int      @default(0)
  createdAt      DateTime @default(now())

  @@unique([playerId, seasonId])
}
```

- [ ] **Step 2: Wire relations into `Player` and `Match`**

In `model Player`, add (alongside the existing `participants` relation line):

```prisma
  seasons        PlayerSeason[]
```

In `model Match`, add a nullable season relation (after the `tournamentId` lines):

```prisma
  season       Season?            @relation(fields: [seasonId], references: [id])
  seasonId     String?
```

- [ ] **Step 3: Write the migration SQL**

Create `prisma/migrations/20260627020000_season_system/migration.sql`:

```sql
-- Season periods (one active: endedAt IS NULL).
CREATE TABLE "Season" (
  "id"        TEXT NOT NULL,
  "number"    INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Season_number_key" ON "Season"("number");

-- Per-season rating + stats for each player (the competitive ladder).
CREATE TABLE "PlayerSeason" (
  "id"             TEXT NOT NULL,
  "playerId"       TEXT NOT NULL,
  "seasonId"       TEXT NOT NULL,
  "crewElo"        DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "impElo"         DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "overallElo"     DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "games"          INTEGER NOT NULL DEFAULT 0,
  "crewGames"      INTEGER NOT NULL DEFAULT 0,
  "impGames"       INTEGER NOT NULL DEFAULT 0,
  "kills"          INTEGER NOT NULL DEFAULT 0,
  "correctShots"   INTEGER NOT NULL DEFAULT 0,
  "incorrectShots" INTEGER NOT NULL DEFAULT 0,
  "tasksDone"      INTEGER NOT NULL DEFAULT 0,
  "crewWins"       INTEGER NOT NULL DEFAULT 0,
  "impWins"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerSeason_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerSeason_playerId_seasonId_key" ON "PlayerSeason"("playerId", "seasonId");

-- Tag matches with the season they counted toward.
ALTER TABLE "Match" ADD COLUMN "seasonId" TEXT;

ALTER TABLE "PlayerSeason" ADD CONSTRAINT "PlayerSeason_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerSeason" ADD CONSTRAINT "PlayerSeason_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply + generate + typecheck**

Run: `npx prisma migrate deploy && npx prisma generate && DATABASE_URL= DIRECT_URL= npx next build`
Expected: migration `20260627020000_season_system` applied; build exits 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260627020000_season_system
git commit -m "feat(db): Season + PlayerSeason models, Match.seasonId"
```

---

### Task 2: `softResetSeed` (pure)

**Files:**
- Create: `src/lib/season/softReset.ts`
- Test: `src/lib/season/softReset.test.ts`

**Interfaces:**
- Produces: `SOFT_RESET_FACTOR: number`; `softResetSeed(prevElo: number | null | undefined, factor?: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { softResetSeed, SOFT_RESET_FACTOR } from "./softReset";

describe("softResetSeed", () => {
  it("seeds a brand-new player at the 1000 baseline", () => {
    expect(softResetSeed(null)).toBe(1000);
    expect(softResetSeed(undefined)).toBe(1000);
  });
  it("pulls a returning player halfway toward 1000 (factor 0.5)", () => {
    expect(softResetSeed(1480)).toBe(1240); // 1000 + 480*0.5
    expect(softResetSeed(800)).toBe(900); // 1000 + (-200)*0.5
    expect(softResetSeed(1000)).toBe(1000);
  });
  it("respects a custom factor", () => {
    expect(softResetSeed(1480, 0.7)).toBe(1336); // 1000 + 480*0.7
    expect(SOFT_RESET_FACTOR).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/season/softReset.test.ts`
Expected: FAIL — cannot find module `./softReset`.

- [ ] **Step 3: Write minimal implementation**

```ts
// Soft reset between seasons: skill carries, the ladder reopens. A returning player's
// rating is pulled partway back toward the 1000 baseline; a new player starts at 1000.
export const SOFT_RESET_FACTOR = 0.5;

export function softResetSeed(
  prevElo: number | null | undefined,
  factor: number = SOFT_RESET_FACTOR,
): number {
  if (prevElo == null) return 1000;
  return 1000 + (prevElo - 1000) * factor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/season/softReset.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/softReset.ts src/lib/season/softReset.test.ts
git commit -m "feat(season): softResetSeed pure helper"
```

---

### Task 3: Season DB helpers — active season, lazy player-season, rollover

**Files:**
- Create: `src/lib/season/season.ts`
- Test: `src/lib/season/season.test.ts` (integration — requires test Postgres)

**Interfaces:**
- Consumes: `softResetSeed` (Task 2).
- Produces:
  - `getOrCreateActiveSeason(tx): Promise<Season>`
  - `getOrCreatePlayerSeason(tx, playerId: string, season: Season): Promise<PlayerSeason>`
  - `rolloverSeason(db: PrismaClient): Promise<Season>`
  - type `SeasonTx = Prisma.TransactionClient | PrismaClient`

- [ ] **Step 1: Write the implementation**

```ts
import type { Prisma, PrismaClient, Season, PlayerSeason } from "@prisma/client";
import { softResetSeed } from "./softReset";

export type SeasonTx = Prisma.TransactionClient | PrismaClient;

// Active season = the single row with endedAt == null. Auto-creates Season 1 if none
// exists so a match is never dropped for lack of a season.
export async function getOrCreateActiveSeason(tx: SeasonTx): Promise<Season> {
  const active = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
  if (active) return active;
  try {
    return await tx.season.create({ data: { number: 1 } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const raced = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
      if (raced) return raced;
    }
    throw e;
  }
}

// Get or lazily create a player's rating row for a season, seeded by a soft reset of
// their most recent prior season (or 1000 if they have none).
export async function getOrCreatePlayerSeason(
  tx: SeasonTx,
  playerId: string,
  season: Season,
): Promise<PlayerSeason> {
  const existing = await tx.playerSeason.findUnique({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
  });
  if (existing) return existing;

  const prior = await tx.playerSeason.findFirst({
    where: { playerId, season: { number: { lt: season.number } } },
    orderBy: { season: { number: "desc" } },
  });

  try {
    return await tx.playerSeason.create({
      data: {
        playerId,
        seasonId: season.id,
        crewElo: softResetSeed(prior?.crewElo ?? null),
        impElo: softResetSeed(prior?.impElo ?? null),
        overallElo: softResetSeed(prior?.overallElo ?? null),
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const raced = await tx.playerSeason.findUnique({
        where: { playerId_seasonId: { playerId, seasonId: season.id } },
      });
      if (raced) return raced;
    }
    throw e;
  }
}

// Admin rollover: end the active season (if any) and open the next number, atomically.
// Re-checks inside the transaction so a double-click is a no-op rather than a double bump.
export async function rolloverSeason(db: PrismaClient): Promise<Season> {
  return db.$transaction(async (tx) => {
    const active = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
    const now = new Date();
    if (active) await tx.season.update({ where: { id: active.id }, data: { endedAt: now } });
    const latest = active ?? (await tx.season.findFirst({ orderBy: { number: "desc" } }));
    return tx.season.create({ data: { number: (latest?.number ?? 0) + 1, startedAt: now } });
  });
}
```

- [ ] **Step 2: Write the failing integration test**

Requires the test Postgres (run with the project's test DB env, e.g. `source scratchpad/dbenv.sh`). The test creates its own player and cleans up.

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason, getOrCreatePlayerSeason, rolloverSeason } from "./season";

let userId: string;
let playerId: string;

beforeAll(async () => {
  const u = await prisma.user.create({ data: { discordId: `test-season-${Date.now()}`, username: "t" } });
  const p = await prisma.player.create({ data: { userId: u.id, displayName: "Seasoner" } });
  userId = u.id; playerId = p.id;
});

afterAll(async () => {
  await prisma.playerSeason.deleteMany({ where: { playerId } });
  await prisma.player.delete({ where: { id: playerId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.season.deleteMany({ where: { number: { gte: 1 } } });
});

describe("season helpers", () => {
  it("creates a season-1 row at 1000, then soft-resets into the next season", async () => {
    const s1 = await getOrCreateActiveSeason(prisma);
    const ps1 = await getOrCreatePlayerSeason(prisma, playerId, s1);
    expect(ps1.overallElo).toBe(1000);

    // Simulate a strong season 1 finish.
    await prisma.playerSeason.update({ where: { id: ps1.id }, data: { overallElo: 1480, crewElo: 1480, impElo: 1480 } });

    const s2 = await rolloverSeason(prisma);
    expect(s2.number).toBe(s1.number + 1);
    const ps2 = await getOrCreatePlayerSeason(prisma, playerId, s2);
    expect(ps2.overallElo).toBe(1240); // 1000 + 480*0.5
  });
});
```

- [ ] **Step 3: Run to verify fail, implement is already written, run to verify pass**

Run: `npx vitest run src/lib/season/season.test.ts`
Expected: PASS (with test DB). If no test DB is available, note it and proceed — Task 5's flow re-exercises these helpers.

- [ ] **Step 4: Commit**

```bash
git add src/lib/season/season.ts src/lib/season/season.test.ts
git commit -m "feat(season): active-season, lazy player-season, rollover helpers"
```

---

### Task 4: Season-scoped match processing

**Files:**
- Modify: `src/lib/ingest/processMatch.ts`
- Test: `src/lib/ingest/processMatch.season.test.ts` (integration — requires test Postgres)

**Interfaces:**
- Consumes: `getOrCreateActiveSeason`, `getOrCreatePlayerSeason` (Task 3); existing `computePerf`, `updateRating`, `kForGames`.
- Produces: no new exports; `processMatch` now writes the active season's `PlayerSeason`, tags `Match.seasonId`, and updates `Player` lifetime counts + career Elo.

- [ ] **Step 1: Add imports**

At the top of `src/lib/ingest/processMatch.ts`, add:

```ts
import { getOrCreateActiveSeason, getOrCreatePlayerSeason } from "../season/season";
```

- [ ] **Step 2: Replace the transaction body**

Replace the `return await prisma.$transaction(async (tx) => { ... });` block (match create → participant loop → return) with this. The Elo math now runs against **season** ratings (`ps`), `MatchParticipant` records the season Elo, `PlayerSeason` is updated, and `Player` keeps lifetime counts + a cumulative career Elo (`+= eloDelta`).

```ts
    return await prisma.$transaction(async (tx) => {
      const season = await getOrCreateActiveSeason(tx);

      // Lazily materialize each player's season rating (soft-reset seeded on first use).
      const seasonByPlayer = new Map<string, Awaited<ReturnType<typeof getOrCreatePlayerSeason>>>();
      for (const { player } of rows) {
        seasonByPlayer.set(player.id, await getOrCreatePlayerSeason(tx, player.id, season));
      }

      // Averages come from SEASON ratings — the competitive ladder for this match.
      const crewAvg = avg(rows.filter((r) => r.p.role === "CREW").map((r) => seasonByPlayer.get(r.player.id)!.crewElo));
      const impAvg = avg(rows.filter((r) => r.p.role === "IMPOSTOR").map((r) => seasonByPlayer.get(r.player.id)!.impElo));

      const match = await tx.match.create({
        data: {
          code: payload.matchCode,
          map: payload.map,
          startedAt: new Date(payload.startedAt),
          endedAt: new Date(payload.endedAt),
          outcome: payload.outcome,
          seasonId: season.id,
        },
      });

      for (const { p, player } of rows) {
        const ps = seasonByPlayer.get(player.id)!;
        const isImp = p.role === "IMPOSTOR";
        const rating = isImp ? ps.impElo : ps.crewElo;
        const opponentAvg = isImp ? crewAvg : impAvg;
        const perf = computePerf(p.role, p);
        const roleGames = isImp ? ps.impGames : ps.crewGames; // per-season placement
        const k = kForGames(roleGames);
        const { eloAfter, eloDelta } = updateRating({ rating, opponentAvg, won: p.won, perf, k });

        await tx.matchParticipant.create({
          data: {
            matchId: match.id,
            playerId: player.id,
            role: p.role,
            won: p.won,
            kills: p.kills,
            correctShots: p.correctShots,
            incorrectShots: p.incorrectShots,
            tasksDone: p.tasksDone,
            tasksTotal: p.tasksTotal,
            timeToTaskMs: p.timeToTaskMs,
            timeToKillMs: p.timeToKillMs,
            survived: p.survived,
            eloBefore: rating,
            eloAfter,
            eloDelta,
          },
        });

        // Season rating + per-season counts (the leaderboard for this season).
        const psCrew = isImp ? ps.crewElo : eloAfter;
        const psImp = isImp ? eloAfter : ps.impElo;
        await tx.playerSeason.update({
          where: { id: ps.id },
          data: {
            crewElo: psCrew,
            impElo: psImp,
            overallElo: (psCrew + psImp) / 2,
            kills: { increment: p.kills },
            correctShots: { increment: p.correctShots },
            incorrectShots: { increment: p.incorrectShots },
            tasksDone: { increment: p.tasksDone },
            crewWins: { increment: !isImp && p.won ? 1 : 0 },
            impWins: { increment: isImp && p.won ? 1 : 0 },
            games: { increment: 1 },
            crewGames: { increment: isImp ? 0 : 1 },
            impGames: { increment: isImp ? 1 : 0 },
          },
        });

        // Player lifetime counters + cumulative career Elo (the all-time board).
        const careerCrew = isImp ? player.crewElo : player.crewElo + eloDelta;
        const careerImp = isImp ? player.impElo + eloDelta : player.impElo;
        await tx.player.update({
          where: { id: player.id },
          data: {
            crewElo: careerCrew,
            impElo: careerImp,
            overallElo: (careerCrew + careerImp) / 2,
            kills: { increment: p.kills },
            correctShots: { increment: p.correctShots },
            incorrectShots: { increment: p.incorrectShots },
            tasksDone: { increment: p.tasksDone },
            crewWins: { increment: !isImp && p.won ? 1 : 0 },
            impWins: { increment: isImp && p.won ? 1 : 0 },
            games: { increment: 1 },
            crewGames: { increment: isImp ? 0 : 1 },
            impGames: { increment: isImp ? 1 : 0 },
          },
        });
      }
      return { matchId: match.id };
    });
```

> Note: `rows` is still built before the transaction exactly as today (the `byDiscord` map and `isLinked` filter are unchanged). Only the transaction body above changes.

- [ ] **Step 3: Write the failing integration test**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { processMatch } from "./processMatch";
import type { MatchPayload } from "./schema";

const TAG = `pm-season-${Date.now()}`;
async function linkedPlayer(name: string) {
  const u = await prisma.user.create({ data: { discordId: `${TAG}-${name}`, username: name } });
  const p = await prisma.player.create({ data: { userId: u.id, displayName: name, isLinked: true } });
  return { userId: u.id, playerId: p.id, discordId: u.discordId };
}

afterAll(async () => {
  await prisma.matchParticipant.deleteMany({ where: { player: { user: { discordId: { startsWith: TAG } } } } });
  await prisma.match.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.playerSeason.deleteMany({ where: { player: { user: { discordId: { startsWith: TAG } } } } });
  await prisma.player.deleteMany({ where: { user: { discordId: { startsWith: TAG } } } });
  await prisma.user.deleteMany({ where: { discordId: { startsWith: TAG } } });
});

it("attributes a match to the active season and seeds PlayerSeason at 1000", async () => {
  const a = await linkedPlayer("Imp"); const b = await linkedPlayer("Crew");
  const payload: MatchPayload = {
    matchCode: `${TAG}-m1`, startedAt: new Date(Date.now() - 600000).toISOString(),
    endedAt: new Date().toISOString(), outcome: "IMP_WIN",
    participants: [
      { discordId: a.discordId, role: "IMPOSTOR", won: true, kills: 2, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
      { discordId: b.discordId, role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 3, tasksTotal: 5, survived: false },
    ],
  };
  const { matchId } = await processMatch(payload);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  expect(match?.seasonId).toBeTruthy();

  const ps = await prisma.playerSeason.findFirst({ where: { playerId: a.playerId } });
  expect(ps?.games).toBe(1);
  expect(ps?.impWins).toBe(1);
  expect(ps?.impElo).toBeGreaterThan(1000); // won → season rating rose from the 1000 seed
});
```

- [ ] **Step 4: Run tests (build first to confirm types)**

Run: `DATABASE_URL= DIRECT_URL= npx next build` (expect exit 0), then `npx vitest run src/lib/ingest/processMatch.season.test.ts` against the test DB.
Expected: build passes; test PASSES (or noted skipped if no test DB).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/processMatch.ts src/lib/ingest/processMatch.season.test.ts
git commit -m "feat(ingest): season-scoped Elo + lifetime/career update"
```

---

### Task 5: Leaderboard API — board param (current / season-N / all-time)

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`
- Create: `src/app/api/seasons/route.ts`

**Interfaces:**
- Consumes: `getOrCreateActiveSeason` (Task 3); existing `realPlayersWhere`, `partitionProvisional`, `PlayerRow`.
- Produces:
  - `GET /api/leaderboard?board=current|all-time|season-<n>&sort=overall|crew|imp` → `{ ranked, provisional }` (unchanged shape).
  - `GET /api/seasons` → `{ seasons: { number: number; active: boolean }[] }` (number desc).

- [ ] **Step 1: Rewrite `src/app/api/leaderboard/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { realPlayersWhere } from "@/lib/players";
import { partitionProvisional, type LeaderboardSort, type PlayerRow } from "@/lib/leaderboard";
import { getOrCreateActiveSeason } from "@/lib/season/season";

const NOT_DEMO = { user: { discordId: { startsWith: "demo-" } } };

export async function GET(req: NextRequest) {
  const sortParam = req.nextUrl.searchParams.get("sort") ?? "overall";
  const sort: LeaderboardSort = sortParam === "crew" ? "crew" : sortParam === "imp" ? "imp" : "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";
  const board = req.nextUrl.searchParams.get("board") ?? "current";

  let rows: PlayerRow[] = [];

  if (board === "all-time") {
    const players = await prisma.player.findMany({ where: realPlayersWhere, orderBy: { [field]: "desc" }, take: 100 });
    rows = players.map((p) => ({
      id: p.id, name: p.displayName,
      crewElo: Math.round(p.crewElo), impElo: Math.round(p.impElo), overallElo: Math.round(p.overallElo),
      games: p.games, crewGames: p.crewGames, impGames: p.impGames,
    }));
  } else {
    // Resolve the season: "current" (active) or "season-<n>".
    const m = /^season-(\d+)$/.exec(board);
    const season = m
      ? await prisma.season.findUnique({ where: { number: Number(m[1]) } })
      : await getOrCreateActiveSeason(prisma);
    if (season) {
      const ps = await prisma.playerSeason.findMany({
        where: { seasonId: season.id, NOT: NOT_DEMO },
        orderBy: { [field]: "desc" },
        take: 100,
        include: { player: true },
      });
      rows = ps.map((r) => ({
        id: r.playerId, name: r.player.displayName,
        crewElo: Math.round(r.crewElo), impElo: Math.round(r.impElo), overallElo: Math.round(r.overallElo),
        games: r.games, crewGames: r.crewGames, impGames: r.impGames,
      }));
    }
  }

  return NextResponse.json(partitionProvisional(rows, sort));
}
```

> `NOT_DEMO` mirrors `realPlayersWhere` but is expressed on the `PlayerSeason → player → user` path.

- [ ] **Step 2: Create `src/app/api/seasons/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const seasons = await prisma.season.findMany({ orderBy: { number: "desc" } });
  return NextResponse.json({
    seasons: seasons.map((s) => ({ number: s.number, active: s.endedAt === null })),
  });
}
```

- [ ] **Step 3: Build to verify types**

Run: `DATABASE_URL= DIRECT_URL= npx next build`
Expected: exit 0; routes `/api/leaderboard` and `/api/seasons` listed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leaderboard/route.ts src/app/api/seasons/route.ts
git commit -m "feat(api): leaderboard board param + seasons list endpoint"
```

---

### Task 6: Leaderboard UI — board switcher

**Files:**
- Modify: `src/components/LeaderboardTable.tsx`

**Interfaces:**
- Consumes: `GET /api/seasons`, `GET /api/leaderboard?board=...&sort=...` (Task 5).

- [ ] **Step 1: Add board state + seasons fetch**

In `LeaderboardTable`, add below the existing `const [sort, setSort] = useState("overall");`:

```tsx
  const [board, setBoard] = useState("current");
  const [seasons, setSeasons] = useState<{ number: number; active: boolean }[]>([]);

  useEffect(() => {
    let on = true;
    fetch("/api/seasons").then((r) => r.json()).then((d) => { if (on) setSeasons(d.seasons ?? []); });
    return () => { on = false; };
  }, []);
```

- [ ] **Step 2: Include `board` in the data fetch**

Change the fetch URL inside the existing data-loading `useEffect`, and add `board` to its dependency array:

```tsx
    const load = () =>
      fetch(`/api/leaderboard?board=${board}&sort=${sort}`)
        .then((r) => r.json())
        .then((d) => {
          if (!on) return;
          setRanked(d.ranked ?? []);
          setProvisional(d.provisional ?? []);
        });
```

```tsx
  }, [sort, board]);
```

- [ ] **Step 3: Render the board switcher**

Immediately inside the returned `<div className="hud-panel hud-corners" ...>`, before the search input `<div>`, add:

```tsx
      <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
        {[
          { key: "current", label: "CURRENT SEASON" },
          { key: "all-time", label: "ALL-TIME" },
          ...seasons.filter((s) => !s.active).map((s) => ({ key: `season-${s.number}`, label: `SEASON ${s.number}` })),
        ].map((b) => (
          <button
            key={b.key}
            onClick={() => setBoard(b.key)}
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "0.7rem", letterSpacing: "0.12em", padding: "5px 12px", cursor: "pointer",
              border: board === b.key ? "none" : "1px solid var(--line)",
              background: board === b.key ? "var(--signal)" : "transparent",
              color: board === b.key ? "#04060b" : "var(--muted)",
              fontWeight: board === b.key ? 700 : 400,
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Build + manual check**

Run: `DATABASE_URL= DIRECT_URL= npx next build` (exit 0). Then manual: `npm run dev`, open `/leaderboard`, confirm the `CURRENT SEASON / ALL-TIME` toggle switches data and any ended seasons appear as `SEASON N` chips.

- [ ] **Step 5: Commit**

```bash
git add src/components/LeaderboardTable.tsx
git commit -m "feat(ui): leaderboard board switcher (current/all-time/past seasons)"
```

---

### Task 7: Admin — season rollover

**Files:**
- Create: `src/app/admin/seasons/page.tsx`
- Create: `src/app/admin/seasons/actions.ts`
- Create: `src/components/RolloverSeasonButton.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin`), `rolloverSeason`, `getOrCreateActiveSeason` (Task 3).
- Produces: admin page at `/admin/seasons`; server action `startNextSeasonAction()`.

- [ ] **Step 1: Server action**

Create `src/app/admin/seasons/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { rolloverSeason } from "@/lib/season/season";

// End the active season and open the next one. Admin-only; safe to call when no
// season exists yet (creates Season 1).
export async function startNextSeasonAction(): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  await rolloverSeason(prisma);
  revalidatePath("/admin/seasons");
  revalidatePath("/leaderboard");
}
```

- [ ] **Step 2: Button component**

Create `src/components/RolloverSeasonButton.tsx`:

```tsx
"use client";
import { startNextSeasonAction } from "@/app/admin/seasons/actions";

export function RolloverSeasonButton({ label }: { label: string }) {
  return (
    <form action={startNextSeasonAction}>
      <button
        className="btn-ghost"
        type="submit"
        style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.55rem 0.9rem" }}
      >
        {label}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Admin page**

Create `src/app/admin/seasons/page.tsx` (mirrors the `requireAdmin()` gate in `src/app/admin/tournaments/page.tsx`):

```tsx
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { RolloverSeasonButton } from "@/components/RolloverSeasonButton";

export const metadata = { title: "Seasons — Among Us .25 Ranked" };

export default async function Page() {
  const admin = await requireAdmin();
  if (!admin) {
    return <main className="max-w-2xl mx-auto p-8"><p style={{ color: "var(--muted)" }}>Admins only. Sign in with an admin account.</p></main>;
  }

  const active = await prisma.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
  const games = active ? await prisma.match.count({ where: { seasonId: active.id } }) : 0;

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// SEASON CONTROL</p>
      <h1 className="text-3xl font-extrabold mb-6">Seasons</h1>
      <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
        {active ? (
          <>
            <p className="eyebrow mb-2">Active</p>
            <p className="data" style={{ margin: "0.25rem 0 1rem" }}>
              Season {active.number} · started {active.startedAt.toLocaleDateString()} · {games} games
            </p>
            <RolloverSeasonButton label={`END SEASON ${active.number} & START ${active.number + 1}`} />
          </>
        ) : (
          <>
            <p className="data" style={{ color: "var(--muted)", margin: "0.25rem 0 1rem" }}>No season has started yet.</p>
            <RolloverSeasonButton label="START SEASON 1" />
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Build + manual check**

Run: `DATABASE_URL= DIRECT_URL= npx next build` (exit 0). Manual (admin account): open `/admin/seasons`, confirm it shows the active season + a rollover button; clicking it ends the season and opens the next (verify the new chip appears on `/leaderboard`).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/seasons src/components/RolloverSeasonButton.tsx
git commit -m "feat(admin): season rollover control"
```

---

## Self-Review

**Spec coverage:**
- Season / PlayerSeason / Match.seasonId model → Task 1. ✓
- Soft-reset ×0.5 seed → Task 2 (pure) + applied in Task 3. ✓
- Lazy creation + active-season auto-create + rollover → Task 3. ✓
- Season-scoped Elo, lifetime + career Elo, MatchParticipant season Elo → Task 4. ✓
- Leaderboards current / past / all-time → Task 5; UI switcher → Task 6. ✓
- Admin-gated manual rollover → Task 7. ✓
- Deferred (scheduled rollover, tiers, per-season match pages) → not built, matches spec. ✓
- Provisional/placement per-season → Task 4 uses `ps` role games; Task 5 reuses `partitionProvisional`. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `getOrCreateActiveSeason`/`getOrCreatePlayerSeason`/`rolloverSeason` signatures identical across Tasks 3, 4, 5, 7. `PlayerRow` shape matches the existing type used by `partitionProvisional`. Composite key `playerId_seasonId` used consistently. Leaderboard response `{ ranked, provisional }` unchanged so the client keeps working. ✓

**Note on profile page:** `src/app/players/[id]` continues to read `Player.*Elo`, which now means *career* Elo — acceptable per spec ("profile career rating"); no change required for v1.
