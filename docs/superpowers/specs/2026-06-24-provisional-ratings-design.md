# Min-Games Gating + Provisional Ratings — Design

Date: 2026-06-24
Branch: feat/initial-build
Status: Approved (design), pending implementation plan

## Problem

The leaderboard ranks every linked player by ELO with no minimum-games gate. Because
everyone starts at a hard 1000 and plain ELO has no rating-confidence concept, a player
with a single lucky game can sit mid-ladder, and a brand-new player appears "ranked"
immediately. This erodes trust in the board — the core credibility question for any
ranked site is "does the #1 actually deserve it?"

## Goal

Only players who have **proven themselves** (played enough games in a role) appear on the
ranked board for that role. Players still in placements are shown separately as
"provisional", and their ratings converge faster during placements so that the first time
they qualify, their ELO is already close to their true skill.

## Decisions (locked during brainstorming)

1. **Display:** Separate "Provisional" section. The main board lists only players at or
   above the threshold; provisional players appear in a clearly-labeled section below,
   showing their progress toward qualifying.
2. **Counting:** Per-role. The Crew tab gates on crew games, the Impostor tab on impostor
   games, and Overall on total games. Requires adding `crewGames`/`impGames` counters,
   backfilled from existing match data.
3. **Threshold:** 10 games per role, expressed as a single tunable constant.
4. **K-factor:** Higher K during placements — `K=64` for a role's first 10 games, then the
   normal `K=32`. Chosen from the role's game count at match time.

## Non-goals

- No full Glicko-2 / rating-deviation system (provisional is a simpler gate).
- No retroactive replay of historical matches with the new K — the K change applies to
  future matches only.
- No rating decay, seasons, or leaderboard pagination (separate future features).

## Data model

Add to `Player` (in `prisma/schema.prisma`):

```prisma
crewGames Int @default(0)
impGames  Int @default(0)
```

Migration adds both columns and backfills from `MatchParticipant` (the source of truth):

```sql
UPDATE "Player" p SET "crewGames" =
  (SELECT count(*) FROM "MatchParticipant" mp WHERE mp."playerId" = p.id AND mp.role = 'CREW');
UPDATE "Player" p SET "impGames" =
  (SELECT count(*) FROM "MatchParticipant" mp WHERE mp."playerId" = p.id AND mp.role = 'IMPOSTOR');
```

The existing total `games` counter is unchanged and is used for the Overall threshold.

## Placement module (single source of truth)

New pure, unit-tested module `src/lib/elo/placement.ts`:

```ts
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

These same helpers are used by the write path (K selection), the API (gating), and the UI
(badges/progress) so the threshold can never drift between layers.

## Write path — `src/lib/ingest/processMatch.ts`

For each participant:
- Compute `roleGames = isImp ? player.impGames : player.crewGames` (value **before** this
  match's increment).
- `const k = kForGames(roleGames)` and pass it to `updateRating({ ..., k })`.
  `updateRating` already accepts an optional `k`, so no change to the ELO core.
- In the `player.update`, increment per-role counters alongside `games`:
  ```ts
  crewGames: { increment: !isImp ? 1 : 0 },
  impGames:  { increment:  isImp ? 1 : 0 },
  ```

## Read path

### `src/lib/players.ts`
Add a helper expressing the "overall-ranked" filter for reuse:

```ts
export const rankedOverallWhere = { ...realPlayersWhere, games: { gte: PLACEMENT_GAMES } };
```

### `/api/leaderboard` — `src/app/api/leaderboard/route.ts`
- Fetch real players sorted by the requested field (unchanged), now also selecting
  `crewGames`/`impGames`.
- Determine the active role's game count per row (`gamesInRole`): crew→crewGames,
  imp→impGames, overall→games.
- Partition into `ranked` (`!isProvisional(gamesInRole)`) and `provisional`
  (`isProvisional(gamesInRole)`).
- `ranked` keeps the ELO-desc order; `provisional` is ordered by `gamesInRole` desc then
  ELO desc (closest to qualifying first).
- Response shape:
  ```ts
  {
    ranked: Row[],
    provisional: Row[],   // each Row also carries gamesInRole
  }
  ```
  where `Row = { id, name, crewElo, impElo, overallElo, games, gamesInRole }`.

### Home `#rankings` — `src/app/page.tsx`
The top-5 query uses `rankedOverallWhere` so provisional players never appear in the
home preview. If fewer than 5 qualify, it simply shows fewer.

## UI

### `src/components/LeaderboardTable.tsx`
- Consume the new `{ ranked, provisional }` response.
- Render the ranked board as today.
- If `provisional.length > 0`, render a de-emphasized section beneath it:
  a `// PROVISIONAL — NEED 10 GAMES` subheader, then rows showing the player and an
  `x/10` progress indicator for the active role (`gamesInRole`/`PLACEMENT_GAMES`).
- Provisional rows are muted (lower contrast) and are not numbered with ranked positions.

### `src/app/players/[id]/page.tsx`
- When the player is overall-provisional (`games < PLACEMENT_GAMES`), show a small
  `PROVISIONAL · x/10 placements` badge near the tier instead of leading with a tier
  emblem that overstates an untested rating. Ranked players are unchanged.

## Testing (TDD)

- `placement.test.ts`: `kForGames` boundaries (9→64, 10→32), `isProvisional` boundaries.
- `processMatch.test.ts` (extend): a player's first 10 role-games use K=64 and the 11th
  uses K=32; `crewGames`/`impGames` increment for the correct role only; total `games`
  still increments every match.
- Leaderboard API test: given players straddling the threshold, the response partitions
  ranked vs provisional correctly per tab and orders provisional by progress.

## Files touched

- `prisma/schema.prisma` (+ migration with backfill SQL)
- `src/lib/elo/placement.ts` (new) + `src/lib/elo/placement.test.ts` (new)
- `src/lib/ingest/processMatch.ts` (+ test updates)
- `src/lib/players.ts` (`rankedOverallWhere` helper)
- `src/app/api/leaderboard/route.ts`
- `src/components/LeaderboardTable.tsx`
- `src/app/page.tsx`
- `src/app/players/[id]/page.tsx`

## Risks

- **Backfill correctness** is the highest-risk step: an off-by-one or wrong role filter
  would wrongly send established players back into placements. Counting from
  `MatchParticipant` (not derived state) and verifying counts post-migration mitigates it.
- **Empty board early in a fresh dataset:** with the 10-game threshold, a brand-new
  season can show an empty ranked board until players place. Acceptable and tunable via
  `PLACEMENT_GAMES`.
