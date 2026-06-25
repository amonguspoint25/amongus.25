# Among Us .25 Ranked

A modern competitive **ranked website** for a custom Among Us server. Players sign in with
Discord, link their in-game identity, and earn **separate Crew and Impostor ELO** ratings
computed from real match stats. Includes a live leaderboard, detailed stat profiles, and
full single-elimination tournament brackets with admin management.

The website is a **read model**: a custom Among Us server (built separately) POSTs finished
matches to a stable ingestion API, which computes ELO and persists everything. Demo data is
loaded through that same ingestion path, so demo and production exercise identical code.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind v4** for styling (blue space-navy theme)
- **Prisma 7** + **PostgreSQL** (Neon), with the `@prisma/adapter-pg` driver adapter
- **Auth.js v5** (`next-auth`) — Discord OAuth
- **Vitest** for tests
- Media generated with Higgsfield (hero video, rank emblems, tournament banner)

## Local development

```bash
npm install
cp .env.example .env        # then fill in the values below
npx prisma migrate deploy   # apply migrations to your database
npm run seed                # 12 demo players + 40 matches (optional)
npm run seed:tournament     # a demo tournament (optional)
npm run dev                 # http://localhost:3000
```

### Environment variables (`.env`)

| Var | What it is |
|-----|-----------|
| `DATABASE_URL` | Neon **pooled** connection string (app runtime). |
| `DIRECT_URL` | Neon **unpooled** connection string (migrations). Same host without `-pooler`. |
| `AUTH_SECRET` | Random secret for Auth.js. Generate: `npx auth secret`. |
| `AUTH_DISCORD_ID` | Discord application Client ID. |
| `AUTH_DISCORD_SECRET` | Discord application Client Secret. |
| `INGEST_TOKEN` | Bearer token the game server uses for the ingestion + link endpoints. Keep it long and random. |
| `NEXT_PUBLIC_APP_NAME` | `Among Us .25 Ranked`. |
| `TEST_DATABASE_URL` / `TEST_DIRECT_URL` | Optional. An isolated Neon **test branch** for DB-backed tests (`vitest` routes to it). |

Secrets live only in `.env` (gitignored) and in your host's env settings — never in git.

## Discord login setup

1. **discord.com/developers/applications** → New Application → `Among Us .25 Ranked`.
2. **OAuth2** → copy **Client ID** + **Client Secret** into `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`.
3. **OAuth2 → Redirects** → add:
   - `http://localhost:3000/api/auth/callback/discord` (local)
   - `https://<your-domain>/api/auth/callback/discord` (production)

On first sign-in the app creates the user's profile and a secure one-time **link code**.

## Making yourself an admin

Tournament creation/management is admin-only. After signing in once, flip your `User.isAdmin`:

```bash
npx prisma studio   # open the User table, set isAdmin = true on your row
```

## Architecture & ELO

- Two ratings per player: **crewElo** and **impElo** (both start at 1000); overall = their average.
- Per match: `newRating = rating + K·(actual − expected) + B·perf`, with `K=32`, `B=10`,
  `expected = 1/(1 + 10^((opponentAvg − rating)/400))`, and `perf ∈ [−1,1]` from role-specific
  stats (kills/time-to-kill for impostors; tasks/shots/time-to-task for crew).
- The performance weighting lives in `src/lib/elo/perf.ts` (`computePerf`) — tune it to taste.

## Ingestion API contract v1 (for the custom server)

The server sends each finished match to the website. Both endpoints authenticate with
`Authorization: Bearer <INGEST_TOKEN>` (timing-safe, fail-closed).

**Identity flow:** match ingestion keys players on `discordId`. The server learns a player's
`discordId` from the `/api/link` redeem response (below) when they link in-game, then caches
in-game player → `discordId` for future match reports.

### `POST /api/ingest/match`

```json
{
  "matchCode": "ABC123",
  "map": "Skeld",
  "startedAt": "2026-06-23T20:00:00Z",
  "endedAt": "2026-06-23T20:12:00Z",
  "outcome": "IMP_WIN",
  "participants": [
    {
      "discordId": "123456789",
      "role": "IMPOSTOR",
      "won": true,
      "kills": 3,
      "correctShots": 0,
      "incorrectShots": 0,
      "tasksDone": 0,
      "tasksTotal": 0,
      "timeToKillMs": 18000,
      "survived": true
    }
  ]
}
```

- `role`: `CREW` | `IMPOSTOR`; `outcome`: `CREW_WIN` | `IMP_WIN`.
- Each impostor's `won` must equal `outcome === "IMP_WIN"` (and crew vice-versa); `tasksDone ≤ tasksTotal`;
  unique `discordId`s; `endedAt ≥ startedAt`; at least one of each role. Invalid payloads → `400`.
- **Idempotent:** `matchCode` is unique — re-POSTing the same match is a safe no-op (returns the existing match).
- Only **linked** players' stats are recorded; unknown/unlinked participants are skipped.

### `POST /api/link`

Called when a player redeems their link code in-game:

```json
{ "linkCode": "AB23CD45" }
```

Marks that player linked so their future matches count. On success returns the identity the
server needs to report that player's matches:

```json
{ "ok": true, "playerId": "clx…", "discordId": "123456789", "displayName": "Red" }
```

`404` (`{ "error": "invalid or expired code" }`) for any unknown, expired, or already-used code —
one response for all three, no existence oracle. Codes are single-use and expire 15 min after issue.

## Deployment (Vercel + Neon)

1. **Neon** already hosts the database — your `DATABASE_URL`/`DIRECT_URL`. Apply migrations
   to it once: `npx prisma migrate deploy`.
2. Push this repo to **GitHub**.
3. **vercel.com** → New Project → import the repo.
4. Add all env vars (the table above) in Vercel **Project Settings → Environment Variables**.
   Set `AUTH_URL` to your production URL (e.g. `https://among-us-25-ranked.vercel.app`).
5. Add the production Discord redirect (see above).
6. Deploy. Then smoke-test: sign in with Discord, and `POST` a test match to
   `https://<domain>/api/ingest/match` with the bearer token — it should appear on the leaderboard.

## Scripts

| Command | Does |
|---------|------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run seed` | Seed demo players + matches |
| `npm run seed:tournament` | Seed a demo tournament |
| `npx vitest run` | Run the test suite |

## Project layout

```
src/lib/elo/         ELO engine (pure, unit-tested)
src/lib/bracket/     single-elim bracket generation (pure, unit-tested)
src/lib/tournament/  create/report tournament logic
src/lib/ingest/      match ingestion + validation
src/lib/serverAuth.ts  timing-safe bearer auth
src/app/             pages + API routes
prisma/              schema + migrations
scripts/             seed harnesses
```
