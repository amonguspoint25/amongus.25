# Among Us .25 Ranked — Design Spec

**Date:** 2026-06-23
**Status:** Approved (pending written-spec review)

## 1. Summary

A modern, competitive ranked website for a custom-server Among Us community. Players
sign in with Discord, link their in-game identity, and accumulate **separate Crew and
Impostor ELO ratings** computed from real match stats. The site provides leaderboards,
detailed stat profiles, and full tournament bracket management. Match data is delivered
by a **custom Among Us server (built separately, later)** that POSTs match results to a
stable ingestion API. The website is built and shipped first against that contract, fed
by realistic seed data that flows through the identical ingestion path.

Brand name: **Among Us .25 Ranked**.

## 2. Scope

**In scope (this project — the website):**
- Discord OAuth login (Auth.js).
- Account linking via one-time link code (bridges Discord identity ↔ in-game identity).
- Ingestion API: authenticated endpoint the server calls with match results.
- ELO engine: split Crew + Impostor true-ELO with stat-based performance modifier.
- Leaderboard (live polling), profile/stats pages, rank tiers.
- Full tournament bracket management (create, seed, single/double elimination,
  report results, auto-advance winners, admin controls).
- Higgsfield-generated media (hero video, rank emblems, character art, tournament banners).
- Unit tests for the ELO engine; validation tests for ingestion.

**Out of scope (separate future projects):**
- The custom Among Us server + reporting plugin (C#). Only its **event contract** is
  defined here so it can be built later to match.

## 3. Architecture

The website is a **read model**; the custom server is the source of truth. The server's
only obligation is to POST match results to a stable contract. Seed data uses the same
ingestion endpoint, so demo and production data exercise identical code.

```
Custom AU Server (later) ──(JSON POST, Bearer token)──► /api/ingest/match
Discord ──OAuth──► Auth.js                              │
                                                         ▼
                                       ELO engine (pure functions)
                                                         ▼
                                       Postgres (Prisma)
                                                         ▼
                              Leaderboard · Profiles · Tournaments · Media
```

**Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, Prisma + Postgres,
Auth.js (Discord provider). Single full-stack project.

## 4. Data Model (Prisma / Postgres)

- **User** — `id, discordId, username, avatar, isAdmin, createdAt`.
- **Player** — profile + ratings: `userId, displayName, linkCode, isLinked,
  crewElo (default 1000), impElo (default 1000), overallElo`, plus lifetime stat totals
  (kills, correctShots, incorrectShots, tasksDone, crewWins, impWins, games, etc.).
- **Match** — `id, code, map, startedAt, endedAt, outcome (CREW_WIN | IMP_WIN),
  tournamentId?`.
- **MatchParticipant** — per-player per-match: `matchId, playerId, role (CREW|IMPOSTOR),
  won, kills, correctShots, incorrectShots, tasksDone, tasksTotal, timeToTaskMs,
  timeToKillMs, survived, eloBefore, eloAfter, eloDelta` (role-appropriate rating).
- **Tournament** — `id, name, slug, bannerUrl, format (SINGLE_ELIM|DOUBLE_ELIM),
  status (DRAFT|ACTIVE|COMPLETE), startsAt, endsAt`.
- **BracketMatch** — stateful tree node: `tournamentId, round, slotInRound,
  playerAId?, playerBId?, winnerId?, matchId?, nextMatchId?, nextSlot (TOP|BOTTOM)`.
  Reporting a result writes the winner into the referenced next node's slot.
- **IngestionToken** — `id, name, hashedToken, createdAt` (server auth).

## 5. ELO Engine (core logic)

Two true-ELO ratings per player (**Crew**, **Impostor**), both starting at **1000**.
Overall = weighted blend of the two. Per match:

```
expected  = 1 / (1 + 10^((opponentAvg − yourRating) / 400))   // win probability
actual    = 1 if your side won else 0
eloCore   = K * (actual − expected)        // K = 32 — win/loss engine (dominant)
bonus     = B * perf                        // B = 10, perf ∈ [−1, 1], capped
newRating = yourRating + eloCore + bonus
```

- `opponentAvg` = average of the opposing role's relevant rating in that match.
- **Crew `perf`**: task completion %, time-to-task efficiency, correct shots (+),
  incorrect shots (−), survival.
- **Impostor `perf`**: kills, time-to-kill efficiency, imp win, avoiding ejection.
- ELO core (win/loss) dominates; stats modulate. Hard-carry in a loss bleeds less;
  passive win gains less.

**Learning-mode contribution:** the `computePerf()` weighting function (≈8 lines — how
much each stat counts) is authored by the project owner. Engine ships with a clear
signature, comments, and a tweakable default. Engine is implemented as **pure functions**
and unit-tested.

**Rank tiers** are derived from overallElo bands (e.g. Bronze → … → Top Impostor), each
mapped to a Higgsfield-generated emblem.

## 6. Pages

- **Landing / Login** — Higgsfield hero background video; "Sign in with Discord".
- **Leaderboard** — sortable by Crew / Impostor / Overall ELO; rank-tier emblems;
  **live polling every ~15s**.
- **Profile / Stats** — ratings + rank emblem; full stat breakdown (shots, kills, tasks,
  win rates, avg time-to-kill / time-to-task); recent matches with ELO deltas.
- **Tournaments** — list + detail with interactive bracket; **full management** for
  admins (create, seed players, choose format, report results, auto-advance).
- **Link account** — shows the user's one-time link code and link status.

## 7. Ingestion API Contract

`POST /api/ingest/match` · `Authorization: Bearer <token>`

```json
{
  "matchCode": "ABC123", "map": "Skeld",
  "startedAt": "2026-06-23T20:00:00Z", "endedAt": "2026-06-23T20:12:00Z",
  "outcome": "IMP_WIN",
  "participants": [
    { "discordId": "123", "role": "IMPOSTOR", "won": true,
      "kills": 3, "correctShots": 0, "incorrectShots": 0,
      "tasksDone": 0, "tasksTotal": 0, "timeToKillMs": 18000, "survived": true }
  ]
}
```

Endpoint: validate (schema) → resolve players by linked `discordId` → compute ELO →
write Match + participants + updated ratings **atomically**. The seed script calls this
same endpoint.

## 8. Visual Direction

- **Theme:** **Among Us .25 Ranked**, blue-forward competitive esports look.
- **Palette:** deep space-navy background, **electric/royal blue primary**, lighter
  cyan-white accents; glassy cards; tasteful motion on hover. Modern, intentional — not a
  template.
- **Media:** Higgsfield set — (a) cinematic hero video, (b) rank-tier emblems,
  (c) crewmate/character art, (d) tournament banners. Saved under `/public/media`.

## 9. Testing

- Unit tests for the ELO engine (correctness-critical).
- Schema/validation + auth tests for the ingestion endpoint.
- Seed harness produces realistic matches through the real ingestion path.

## 10. Build Order (high level)

1. Project scaffold (Next.js, Tailwind, Prisma schema, Auth.js Discord).
2. ELO engine + unit tests (incl. owner's `computePerf`).
3. Ingestion endpoint + validation + atomic write.
4. Seed harness (realistic matches via ingestion).
5. Leaderboard + profile/stats pages.
6. Account linking flow.
7. Tournament bracket management.
8. Higgsfield media generation + visual polish.
