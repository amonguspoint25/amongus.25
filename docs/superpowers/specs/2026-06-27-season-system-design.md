# Season System — Design Spec

**Date:** 2026-06-27
**Status:** Approved (pending written-spec review)
**Repo:** `among-us-25-ranked` (Next.js 16 + Prisma 7 + Neon + Auth.js)

## Context

The site ranks Among Us players with Elo. Today **all ratings and stats live on
the `Player` row** as lifetime values (`crewElo`, `impElo`, `overallElo`, `games`,
`crewWins`, …) and each ingested match updates them in place (`src/lib/ingest/processMatch.ts`).
There is no notion of a competitive season — the ladder never resets, so late
joiners can never catch early leaders and there is no "fresh start" cadence.

This adds a **season system**: recurring competitive periods with their own
leaderboards, a **soft Elo reset** between seasons (skill carries, ladder reopens),
and preserved lifetime stats for an all-time board.

Elo is **stateful and sequential** — a rating depends on every match before it — so
a season's standings cannot be derived by filtering matches by date. Season ratings
must be **stored per season**. That single fact drives the data model below.

## Decisions (locked)

- **Reset between seasons:** soft reset, factor **×0.5** → `seed = 1000 + (prevElo − 1000) × 0.5`.
- **Leaderboards:** Current season, browsable Past seasons, and an All-Time board.
- **All-Time ranking:** by career Elo (cumulative), with games/wins/kills shown.
- **Season lifecycle:** manual admin rollover for v1 (scheduled/auto deferred).
- **Admin:** all season controls gated behind existing `requireAdmin()`.

## Data Model

### New: `Season`
| field | type | notes |
| --- | --- | --- |
| `id` | String cuid | PK |
| `number` | Int `@unique` | 1, 2, 3 … (display + ordering) |
| `startedAt` | DateTime | set on creation |
| `endedAt` | DateTime? | `null` = active. **At most one active season.** |
| `createdAt` | DateTime | default now |

Active season = the one row with `endedAt == null`. Enforced in app logic
(rollover sets the old `endedAt` and creates the next in one transaction).

### New: `PlayerSeason` (the competitive rating)
One row per (player, season). Holds that season's Elo + counting stats — a
season-scoped mirror of the rating fields currently on `Player`.

| field | type | notes |
| --- | --- | --- |
| `id` | String cuid | PK |
| `playerId` / `seasonId` | String | relations; `@@unique([playerId, seasonId])` |
| `crewElo` / `impElo` / `overallElo` | Float | seeded by soft reset (below) |
| `games` / `crewGames` / `impGames` | Int default 0 | per-season counts |
| `kills` / `correctShots` / `incorrectShots` / `tasksDone` | Int default 0 | per-season |
| `crewWins` / `impWins` | Int default 0 | per-season |
| `createdAt` | DateTime | default now |

**Lazy creation + soft-reset seed:** a `PlayerSeason` is created the first time a
player appears in a match for the active season. Seed:
- look up the player's most recent prior `PlayerSeason` (highest season `number` < active);
- if found: `seed = 1000 + (prevElo − 1000) × 0.5` for each of crew/imp/overall;
- else (brand-new player): `1000`.

This means **starting a season is a single `Season` row** — no batch reset job.

### Changed: `Match`
- add `seasonId String?` + relation. Set to the active season at ingest time.
  Nullable so pre-season historical matches remain valid.

### Unchanged: `Player` (now the All-Time aggregate)
- Lifetime counters (`games`, `crewWins`, `impWins`, `kills`, …) keep incrementing
  across all seasons — these power the **All-Time** board.
- `crewElo` / `impElo` / `overallElo` become a **career Elo**: each match applies the
  same per-match delta computed against season ratings (one extra add per player,
  no second Elo computation). Used for All-Time ranking and profile "career rating".

## Match Flow (`processMatch.ts`)

```
match ingested
 → season = active Season (endedAt == null); if none, see Error Handling
 → set Match.seasonId = season.id
 → for each participant:
     ps = getOrCreatePlayerSeason(playerId, season)   // soft-reset seed on create
     compute Elo vs other participants' SEASON ratings (existing elo/* engine)
     update ps: season Elo + per-season counts (+1 game, +win, +kills…)
     update Player: lifetime counts (+1 game, +win, …) AND career Elo += delta
 → MatchParticipant.eloBefore/After/Delta record the SEASON Elo (the competitive one)
```

Idempotency (existing `Match.code` unique short-circuit + P2002 race handling) is
preserved unchanged. The whole per-match update stays inside the existing
`prisma.$transaction`.

## Leaderboards

API: `GET /api/leaderboard?board=current|all-time|season-<n>&sort=overall|crew|imp`
(default `board=current`, preserving today's behavior shape).

- **current** → `PlayerSeason` where `season = active`, ordered by the sort's Elo field.
- **season-N** → `PlayerSeason` where `season.number = N` (frozen once the season ends).
- **all-time** → `Player` lifetime rows, ordered by career Elo; show games/wins/kills.

Existing helpers reused: `realPlayersWhere` (exclude `demo-` seed users),
`partitionProvisional` + placement logic (`src/lib/leaderboard.ts`,
`src/lib/elo/placement.ts`) — applied per board against whichever row set is loaded.
`PlayerRow` already carries exactly the fields needed; the season query maps
`PlayerSeason` → `PlayerRow` the same way the current query maps `Player`.

UI (`src/app/leaderboard/page.tsx` + `LeaderboardTable`): add a board switcher
`[ Current Season ] [ All-Time ] [ Past Seasons ▾ ]`. Past-seasons dropdown lists
ended seasons by number.

## Admin Control

New `src/app/admin/seasons/page.tsx`, gated by `requireAdmin()` (same pattern as
`src/app/admin/tournaments/page.tsx`):
- shows the active season (number, started date, player/game counts);
- **"End Season N & start Season N+1"** button → server action in a transaction:
  set current `endedAt = now`, create `Season { number: N+1, startedAt: now }`.
- if no season exists yet, button reads **"Start Season 1"**.

## Error Handling

- **No active season at ingest:** matches must still be accepted (don't lose data).
  Auto-create **Season 1** on first ingest if none exists, then proceed. (Admin can
  also "Start Season 1" explicitly beforehand.)
- **Concurrent `PlayerSeason` create** (two matches racing for a new player+season):
  unique `@@unique([playerId, seasonId])` → catch P2002, re-read, continue (mirror
  the existing concurrent-create handling in `auth.ts`/`processMatch.ts`).
- **Rollover race** (double-clicking "end season"): do it in a transaction and
  re-check `endedAt == null` before acting; a second call is a no-op.

## Testing

- **Unit (no DB):** `softResetSeed(prevElo, factor)` pure function — seeds correctly
  for a returning player, a new player (1000), and clamps as expected. Mirror the
  existing `src/lib/elo/*.test.ts` style.
- **Unit:** leaderboard mapping `PlayerSeason → PlayerRow` + provisional partition
  for a season board (reuse existing leaderboard test patterns).
- **Integration (requires test Postgres, existing harness):** ingest a match with no
  season → Season 1 auto-created, `PlayerSeason` seeded at 1000; roll to Season 2 →
  new match seeds via ×0.5 soft reset; All-Time counters accumulate across both.

## Out of Scope (deferred)

- Scheduled / automatic season rollover (dates + cron). Manual only for v1.
- Rank tiers / badges (Bronze→Gold), season rewards.
- Dedicated per-season match-history pages (the `Match.seasonId` makes this a later add).

## Files Touched (summary)

- `prisma/schema.prisma` — add `Season`, `PlayerSeason`, `Match.seasonId`; migration.
- `src/lib/season/` (new) — active-season lookup, `getOrCreatePlayerSeason`, `softResetSeed`.
- `src/lib/ingest/processMatch.ts` — season-scoped Elo write + lifetime/career update.
- `src/app/api/leaderboard/route.ts` + `src/lib/leaderboard.ts` — `board` param, season/all-time queries.
- `src/app/leaderboard/page.tsx` + `src/components/LeaderboardTable.tsx` — board switcher.
- `src/app/admin/seasons/page.tsx` + season server actions — rollover control.
