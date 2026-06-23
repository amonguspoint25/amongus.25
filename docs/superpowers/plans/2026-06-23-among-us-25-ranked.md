# Among Us .25 Ranked — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable Among Us ranked website with Discord login, split Crew/Impostor ELO computed from ingested match stats, live leaderboard, stat profiles, full tournament bracket management, and Higgsfield media.

**Architecture:** Single Next.js (App Router) full-stack app. The website is a read model; a custom Among Us server (built later) POSTs match results to a stable ingestion API. ELO is computed by pure functions and persisted in Postgres via Prisma. Seed data flows through the real ingestion endpoint. Deployed to Vercel + Neon Postgres.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Tailwind CSS, Prisma + Postgres (Neon), Auth.js (Discord), Zod, Vitest. Host: Vercel.

## Global Constraints

- Brand/name everywhere: **Among Us .25 Ranked**.
- Theme: blue-forward (deep space-navy bg, electric/royal blue primary, cyan-white accents). Not a template look.
- ELO defaults: start rating **1000**, K = **32**, B = **10**, perf ∈ **[−1, 1]**.
- Two ratings per player: **crewElo**, **impElo**; overall = 50/50 blend.
- All secrets in env vars, never committed. `.env.example` documents every var.
- Seed and server use the **same** ingestion endpoint.
- TDD: correctness-critical tasks (ELO, ingestion, bracket) write failing test first.

---

### Task 1: Project scaffold + theme tokens

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/theme.ts`

**Interfaces:**
- Produces: working `npm run dev`; CSS variables `--bg`, `--primary`, `--accent`, `--surface`; `vitest` runnable.

- [ ] **Step 1: Scaffold app**

```bash
cd /c/Users/coleh/among-us-25-ranked
npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-import-alias --use-npm --yes
npm i zod @prisma/client && npm i -D prisma vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npm i next-auth@beta
```

- [ ] **Step 2: Define theme tokens in `src/app/globals.css`** (append after Tailwind imports)

```css
:root {
  --bg: oklch(16% 0.03 264);
  --surface: oklch(22% 0.04 264);
  --primary: oklch(62% 0.19 255);   /* electric/royal blue */
  --accent: oklch(80% 0.10 220);    /* cyan-white */
  --text: oklch(96% 0.01 264);
  --muted: oklch(70% 0.02 264);
}
body { background: var(--bg); color: var(--text); }
```

- [ ] **Step 3: Add `.env.example`**

```
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
AUTH_SECRET="generate-with: npx auth secret"
AUTH_DISCORD_ID=""
AUTH_DISCORD_SECRET=""
INGEST_TOKEN="long-random-string"
NEXT_PUBLIC_APP_NAME="Among Us .25 Ranked"
```

- [ ] **Step 4: Add vitest config** `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 5: Verify dev server + tests**

Run: `npm run dev` (expect server on :3000), then Ctrl-C; `npx vitest run` (expect "no test files" or pass).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with blue theme tokens"
```

---

### Task 2: Prisma schema + migration

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`

**Interfaces:**
- Produces: Prisma models `User, Player, Match, MatchParticipant, Tournament, BracketMatch, IngestionToken`; exported `prisma` client from `src/lib/db.ts`.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id        String   @id @default(cuid())
  discordId String   @unique
  username  String
  avatar    String?
  isAdmin   Boolean  @default(false)
  player    Player?
  createdAt DateTime @default(now())
}

model Player {
  id             String   @id @default(cuid())
  user           User     @relation(fields: [userId], references: [id])
  userId         String   @unique
  displayName    String
  linkCode       String   @unique
  isLinked       Boolean  @default(false)
  crewElo        Float    @default(1000)
  impElo         Float    @default(1000)
  overallElo     Float    @default(1000)
  kills          Int      @default(0)
  correctShots   Int      @default(0)
  incorrectShots Int      @default(0)
  tasksDone      Int      @default(0)
  crewWins       Int      @default(0)
  impWins        Int      @default(0)
  games          Int      @default(0)
  participants   MatchParticipant[]
  createdAt      DateTime @default(now())
}

enum Outcome { CREW_WIN IMP_WIN }
enum Role { CREW IMPOSTOR }

model Match {
  id           String   @id @default(cuid())
  code         String
  map          String?
  startedAt    DateTime
  endedAt      DateTime
  outcome      Outcome
  tournament   Tournament? @relation(fields: [tournamentId], references: [id])
  tournamentId String?
  participants MatchParticipant[]
  createdAt    DateTime @default(now())
}

model MatchParticipant {
  id             String  @id @default(cuid())
  match          Match   @relation(fields: [matchId], references: [id])
  matchId        String
  player         Player  @relation(fields: [playerId], references: [id])
  playerId       String
  role           Role
  won            Boolean
  kills          Int     @default(0)
  correctShots   Int     @default(0)
  incorrectShots Int     @default(0)
  tasksDone      Int     @default(0)
  tasksTotal     Int     @default(0)
  timeToTaskMs   Int?
  timeToKillMs   Int?
  survived       Boolean @default(true)
  eloBefore      Float
  eloAfter       Float
  eloDelta       Float
}

enum TFormat { SINGLE_ELIM DOUBLE_ELIM }
enum TStatus { DRAFT ACTIVE COMPLETE }
enum Bracket { WINNERS LOSERS GRAND }
enum Slot { TOP BOTTOM }

model Tournament {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  bannerUrl String?
  format    TFormat  @default(SINGLE_ELIM)
  status    TStatus  @default(DRAFT)
  startsAt  DateTime?
  endsAt    DateTime?
  matches   Match[]
  bracket   BracketMatch[]
  createdAt DateTime @default(now())
}

model BracketMatch {
  id                String   @id @default(cuid())
  tournament        Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId      String
  bracket           Bracket  @default(WINNERS)
  round             Int
  slotInRound       Int
  playerAId         String?
  playerBId         String?
  winnerId          String?
  matchId           String?
  winnerNextMatchId String?
  winnerNextSlot    Slot?
  loserNextMatchId  String?
  loserNextSlot     Slot?
}

model IngestionToken {
  id          String   @id @default(cuid())
  name        String
  hashedToken String   @unique
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Create `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```

- [ ] **Step 3: Generate client + migrate** (needs a `DATABASE_URL`; use a local/Neon dev DB)

Run: `npx prisma migrate dev --name init`
Expected: migration applied, client generated.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: prisma schema for players, matches, tournaments, brackets"
```

---

### Task 3: ELO engine (pure functions + unit tests) ⭐

**Files:**
- Create: `src/lib/elo/expected.ts`, `src/lib/elo/perf.ts`, `src/lib/elo/update.ts`, `src/lib/elo/elo.test.ts`

**Interfaces:**
- Produces:
  - `expectedScore(rating: number, opponentAvg: number): number`
  - `computePerf(role: "CREW"|"IMPOSTOR", s: PerfStats): number` — clamped [−1,1]
  - `updateRating(args: { rating: number; opponentAvg: number; won: boolean; perf: number; k?: number; b?: number }): { eloAfter: number; eloDelta: number }`
  - type `PerfStats = { kills:number; correctShots:number; incorrectShots:number; tasksDone:number; tasksTotal:number; timeToKillMs?:number; timeToTaskMs?:number; survived:boolean }`

- [ ] **Step 1: Write failing test `src/lib/elo/elo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { expectedScore } from "./expected";
import { updateRating } from "./update";
import { computePerf } from "./perf";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });
  it("favors the higher-rated side", () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
  });
});

describe("updateRating", () => {
  it("gains less for an expected win", () => {
    const fav = updateRating({ rating: 1400, opponentAvg: 1000, won: true, perf: 0 });
    const upset = updateRating({ rating: 1000, opponentAvg: 1400, won: true, perf: 0 });
    expect(upset.eloDelta).toBeGreaterThan(fav.eloDelta);
  });
  it("perf bonus moves the result", () => {
    const flat = updateRating({ rating: 1000, opponentAvg: 1000, won: true, perf: 0 });
    const carry = updateRating({ rating: 1000, opponentAvg: 1000, won: true, perf: 1 });
    expect(carry.eloAfter).toBeGreaterThan(flat.eloAfter);
  });
});

describe("computePerf", () => {
  it("rewards impostor kills, penalizes nothing missing", () => {
    const p = computePerf("IMPOSTOR", { kills: 3, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true });
    expect(p).toBeGreaterThan(0);
  });
  it("penalizes crew incorrect shots", () => {
    const good = computePerf("CREW", { kills: 0, correctShots: 1, incorrectShots: 0, tasksDone: 5, tasksTotal: 5, survived: true });
    const bad  = computePerf("CREW", { kills: 0, correctShots: 0, incorrectShots: 2, tasksDone: 1, tasksTotal: 5, survived: false });
    expect(good).toBeGreaterThan(bad);
  });
  it("stays within [-1,1]", () => {
    const p = computePerf("IMPOSTOR", { kills: 99, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true });
    expect(p).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run src/lib/elo/elo.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/lib/elo/expected.ts`**

```ts
export function expectedScore(rating: number, opponentAvg: number): number {
  return 1 / (1 + Math.pow(10, (opponentAvg - rating) / 400));
}
```

- [ ] **Step 4: Implement `src/lib/elo/perf.ts`** (default weights — OWNER may tune)

```ts
export type PerfStats = {
  kills: number; correctShots: number; incorrectShots: number;
  tasksDone: number; tasksTotal: number;
  timeToKillMs?: number; timeToTaskMs?: number; survived: boolean;
};

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

/**
 * computePerf — OWNER CONTRIBUTION POINT.
 * Returns a normalized performance score in [-1, 1] for the player's role.
 * Tune the weights below to shape how much each stat matters.
 */
export function computePerf(role: "CREW" | "IMPOSTOR", s: PerfStats): number {
  if (role === "IMPOSTOR") {
    const killScore = s.kills * 0.25;                       // each kill helps
    const speed = s.timeToKillMs ? clamp((30000 - s.timeToKillMs) / 30000) * 0.3 : 0;
    const survival = s.survived ? 0.15 : -0.15;
    return clamp(killScore + speed + survival);
  }
  const taskPct = s.tasksTotal ? s.tasksDone / s.tasksTotal : 0;
  const taskScore = taskPct * 0.4;
  const shots = s.correctShots * 0.2 - s.incorrectShots * 0.25;
  const speed = s.timeToTaskMs ? clamp((120000 - s.timeToTaskMs) / 120000) * 0.2 : 0;
  const survival = s.survived ? 0.1 : -0.1;
  return clamp(taskScore + shots + speed + survival);
}
```

- [ ] **Step 5: Implement `src/lib/elo/update.ts`**

```ts
import { expectedScore } from "./expected";
export function updateRating(args: {
  rating: number; opponentAvg: number; won: boolean; perf: number; k?: number; b?: number;
}): { eloAfter: number; eloDelta: number } {
  const { rating, opponentAvg, won, perf, k = 32, b = 10 } = args;
  const expected = expectedScore(rating, opponentAvg);
  const core = k * ((won ? 1 : 0) - expected);
  const bonus = b * Math.max(-1, Math.min(1, perf));
  const eloDelta = core + bonus;
  return { eloAfter: rating + eloDelta, eloDelta };
}
```

- [ ] **Step 6: Run tests, verify PASS**

Run: `npx vitest run src/lib/elo/elo.test.ts`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: split crew/impostor ELO engine with tested pure functions"
```

---

### Task 4: Ingestion endpoint (validation + atomic ELO write) ⭐

**Files:**
- Create: `src/lib/ingest/schema.ts`, `src/lib/ingest/processMatch.ts`, `src/app/api/ingest/match/route.ts`, `src/lib/ingest/processMatch.test.ts`

**Interfaces:**
- Consumes: `updateRating`, `computePerf`, `expectedScore`, `prisma`.
- Produces:
  - Zod `matchPayloadSchema` and `MatchPayload` type matching the contract.
  - `processMatch(payload: MatchPayload): Promise<{ matchId: string }>` — resolves players by linked discordId, computes per-role ELO using opposing-role average rating, writes Match + participants + updated Player ratings/totals in one `prisma.$transaction`.
  - `POST /api/ingest/match` — Bearer `INGEST_TOKEN` auth → validate → `processMatch` → 200 `{matchId}`; 401/400 on failure.

- [ ] **Step 1: Write `src/lib/ingest/schema.ts`**

```ts
import { z } from "zod";
export const participantSchema = z.object({
  discordId: z.string(),
  role: z.enum(["CREW", "IMPOSTOR"]),
  won: z.boolean(),
  kills: z.number().int().min(0).default(0),
  correctShots: z.number().int().min(0).default(0),
  incorrectShots: z.number().int().min(0).default(0),
  tasksDone: z.number().int().min(0).default(0),
  tasksTotal: z.number().int().min(0).default(0),
  timeToKillMs: z.number().int().min(0).optional(),
  timeToTaskMs: z.number().int().min(0).optional(),
  survived: z.boolean().default(true),
});
export const matchPayloadSchema = z.object({
  matchCode: z.string(),
  map: z.string().optional(),
  startedAt: z.string(),
  endedAt: z.string(),
  outcome: z.enum(["CREW_WIN", "IMP_WIN"]),
  participants: z.array(participantSchema).min(1),
});
export type MatchPayload = z.infer<typeof matchPayloadSchema>;
```

- [ ] **Step 2: Write failing test `src/lib/ingest/processMatch.test.ts`** (uses a test DB; skip if unavailable)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db";
import { processMatch } from "./processMatch";

async function makePlayer(discordId: string) {
  const user = await prisma.user.create({ data: { discordId, username: discordId } });
  return prisma.player.create({ data: { userId: user.id, displayName: discordId, linkCode: discordId + "-c", isLinked: true } });
}

describe("processMatch", () => {
  beforeEach(async () => {
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
  });
  it("updates impostor rating up on a win and writes a match", async () => {
    const imp = await makePlayer("imp1");
    await makePlayer("crew1");
    const res = await processMatch({
      matchCode: "T1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: "IMP_WIN",
      participants: [
        { discordId: "imp1", role: "IMPOSTOR", won: true, kills: 3, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true, timeToKillMs: 15000 },
        { discordId: "crew1", role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false },
      ],
    });
    expect(res.matchId).toBeTruthy();
    const updated = await prisma.player.findUnique({ where: { id: imp.id } });
    expect(updated!.impElo).toBeGreaterThan(1000);
    expect(updated!.impWins).toBe(1);
  });
});
```

- [ ] **Step 3: Run test, verify FAIL**

Run: `npx vitest run src/lib/ingest/processMatch.test.ts`
Expected: FAIL (processMatch not found).

- [ ] **Step 4: Implement `src/lib/ingest/processMatch.ts`**

```ts
import { prisma } from "../db";
import { computePerf } from "../elo/perf";
import { updateRating } from "../elo/update";
import type { MatchPayload } from "./schema";

export async function processMatch(payload: MatchPayload): Promise<{ matchId: string }> {
  const discordIds = payload.participants.map((p) => p.discordId);
  const players = await prisma.player.findMany({
    where: { isLinked: true, user: { discordId: { in: discordIds } } },
    include: { user: true },
  });
  const byDiscord = new Map(players.map((p) => [p.user.discordId, p]));

  const rows = payload.participants
    .map((p) => ({ p, player: byDiscord.get(p.discordId) }))
    .filter((r): r is { p: typeof r.p; player: NonNullable<typeof r.player> } => !!r.player);

  const crewAvg = avg(rows.filter((r) => r.p.role === "CREW").map((r) => r.player.crewElo));
  const impAvg = avg(rows.filter((r) => r.p.role === "IMPOSTOR").map((r) => r.player.impElo));

  return prisma.$transaction(async (tx) => {
    const match = await tx.match.create({
      data: {
        code: payload.matchCode, map: payload.map,
        startedAt: new Date(payload.startedAt), endedAt: new Date(payload.endedAt),
        outcome: payload.outcome,
      },
    });
    for (const { p, player } of rows) {
      const isImp = p.role === "IMPOSTOR";
      const rating = isImp ? player.impElo : player.crewElo;
      const opponentAvg = isImp ? crewAvg : impAvg;
      const perf = computePerf(p.role, p);
      const { eloAfter, eloDelta } = updateRating({ rating, opponentAvg, won: p.won, perf });
      await tx.matchParticipant.create({
        data: {
          matchId: match.id, playerId: player.id, role: p.role, won: p.won,
          kills: p.kills, correctShots: p.correctShots, incorrectShots: p.incorrectShots,
          tasksDone: p.tasksDone, tasksTotal: p.tasksTotal,
          timeToTaskMs: p.timeToTaskMs, timeToKillMs: p.timeToKillMs, survived: p.survived,
          eloBefore: rating, eloAfter, eloDelta,
        },
      });
      const newCrew = isImp ? player.crewElo : eloAfter;
      const newImp = isImp ? eloAfter : player.impElo;
      await tx.player.update({
        where: { id: player.id },
        data: {
          crewElo: newCrew, impElo: newImp, overallElo: (newCrew + newImp) / 2,
          kills: { increment: p.kills }, correctShots: { increment: p.correctShots },
          incorrectShots: { increment: p.incorrectShots }, tasksDone: { increment: p.tasksDone },
          crewWins: { increment: !isImp && p.won ? 1 : 0 },
          impWins: { increment: isImp && p.won ? 1 : 0 },
          games: { increment: 1 },
        },
      });
    }
    return { matchId: match.id };
  });
}
function avg(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1000; }
```

- [ ] **Step 5: Implement route `src/app/api/ingest/match/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { matchPayloadSchema } from "@/lib/ingest/schema";
import { processMatch } from "@/lib/ingest/processMatch";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.INGEST_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = matchPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await processMatch(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
```

- [ ] **Step 6: Run test, verify PASS**

Run: `npx vitest run src/lib/ingest/processMatch.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: authenticated match ingestion with atomic ELO write"
```

---

### Task 5: Seed harness (realistic matches via ingestion)

**Files:**
- Create: `scripts/seed.ts`, add `"seed": "tsx scripts/seed.ts"` to `package.json`; `npm i -D tsx`

**Interfaces:**
- Consumes: `processMatch` (call directly to avoid HTTP), creates demo linked players.
- Produces: ~12 demo players, ~40 matches with varied stats so leaderboard/profiles render.

- [ ] **Step 1: Write `scripts/seed.ts`**

```ts
import { prisma } from "../src/lib/db";
import { processMatch } from "../src/lib/ingest/processMatch";

const NAMES = ["Red","Blue","Green","Lime","Cyan","Rose","Black","White","Purple","Orange","Yellow","Pink"];
const rnd = (n: number) => Math.floor(Math.random() * n);

async function main() {
  await prisma.matchParticipant.deleteMany(); await prisma.match.deleteMany();
  await prisma.player.deleteMany(); await prisma.user.deleteMany();
  for (const n of NAMES) {
    const u = await prisma.user.create({ data: { discordId: "demo-" + n, username: n } });
    await prisma.player.create({ data: { userId: u.id, displayName: n, linkCode: n + "-LINK", isLinked: true } });
  }
  for (let m = 0; m < 40; m++) {
    const shuffled = [...NAMES].sort(() => Math.random() - 0.5).slice(0, 8);
    const imps = shuffled.slice(0, 2); const crew = shuffled.slice(2);
    const impWin = Math.random() < 0.45;
    await processMatch({
      matchCode: "SEED" + m, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: impWin ? "IMP_WIN" : "CREW_WIN",
      participants: [
        ...imps.map((d) => ({ discordId: "demo-" + d, role: "IMPOSTOR" as const, won: impWin,
          kills: rnd(4), correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0,
          timeToKillMs: 8000 + rnd(25000), survived: Math.random() < 0.5 })),
        ...crew.map((d) => ({ discordId: "demo-" + d, role: "CREW" as const, won: !impWin,
          kills: 0, correctShots: rnd(2), incorrectShots: rnd(2), tasksDone: rnd(6), tasksTotal: 5,
          timeToTaskMs: 40000 + rnd(80000), survived: Math.random() < 0.6 })),
      ],
    });
  }
  console.log("seeded");
}
main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run seed, verify rows**

Run: `npm run seed`
Expected: "seeded"; `npx prisma studio` shows players with varied ELO.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: seed harness producing realistic matches via ingestion"
```

---

### Task 6: Discord auth (Auth.js)

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/components/SignInButton.tsx`
- Modify: `src/app/layout.tsx` (session provider)

**Interfaces:**
- Produces: `auth()` server helper; on first sign-in, upserts `User` (+ `Player` with generated `linkCode`).

- [ ] **Step 1: Write `src/auth.ts`**

```ts
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Discord],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;
      const discordId = String(profile.id);
      const user = await prisma.user.upsert({
        where: { discordId },
        update: { username: String(profile.username ?? profile.global_name ?? "player"), avatar: profile.image_url as string | undefined },
        create: { discordId, username: String(profile.username ?? "player"), avatar: profile.image_url as string | undefined },
      });
      await prisma.player.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, displayName: user.username, linkCode: genCode() },
      });
      return true;
    },
  },
});
function genCode(): string {
  return Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
}
```

- [ ] **Step 2: Route `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: `src/components/SignInButton.tsx`**

```tsx
import { signIn, signOut, auth } from "@/auth";
export async function SignInButton() {
  const session = await auth();
  if (session) return <form action={async () => { "use server"; await signOut(); }}><button>Sign out</button></form>;
  return <form action={async () => { "use server"; await signIn("discord"); }}><button>Sign in with Discord</button></form>;
}
```

- [ ] **Step 4: Manual verify** — set `AUTH_DISCORD_ID/SECRET` from a Discord app with callback `http://localhost:3000/api/auth/callback/discord`; `npm run dev`; sign in; confirm a `Player` row with a `linkCode`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: discord oauth with auto player + link code creation"
```

---

### Task 7: Account linking flow

**Files:**
- Create: `src/app/link/page.tsx`, `src/app/api/link/route.ts`

**Interfaces:**
- Consumes: `auth()`, `prisma`.
- Produces: `/link` shows the signed-in user's `linkCode` + status. `POST /api/link` (Bearer `INGEST_TOKEN`) body `{ linkCode, discordId }` marks the matching player `isLinked=true` — called by the server when a player redeems their code in-game.

- [ ] **Step 1: `src/app/api/link/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.INGEST_TOKEN}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { linkCode } = await req.json();
  const player = await prisma.player.findUnique({ where: { linkCode } });
  if (!player) return NextResponse.json({ error: "invalid code" }, { status: 404 });
  await prisma.player.update({ where: { id: player.id }, data: { isLinked: true } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `src/app/link/page.tsx`**

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
export default async function LinkPage() {
  const session = await auth();
  if (!session?.user) return <main className="p-8">Sign in to get your link code.</main>;
  const player = await prisma.player.findFirst({ where: { user: { discordId: (session.user as any).id ?? undefined } } });
  return <main className="p-8"><h1>Link your account</h1><p>Your code: <strong>{player?.linkCode}</strong></p><p>{player?.isLinked ? "Linked ✓" : "Redeem this code in-game on the .25 server."}</p></main>;
}
```

- [ ] **Step 3: Manual verify** — visit `/link` while signed in; POST the code to `/api/link`; confirm `isLinked` flips.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: account linking via one-time code"
```

---

### Task 8: Leaderboard page (live polling)

**Files:**
- Create: `src/app/api/leaderboard/route.ts`, `src/app/leaderboard/page.tsx`, `src/components/LeaderboardTable.tsx`, `src/lib/rank.ts`

**Interfaces:**
- Consumes: `prisma`, rank tiers.
- Produces: `GET /api/leaderboard?sort=overall|crew|imp` → JSON rows; client component polls every 15s.

- [ ] **Step 1: `src/lib/rank.ts`**

```ts
export const TIERS = [
  { name: "Bronze", min: 0 }, { name: "Silver", min: 950 }, { name: "Gold", min: 1050 },
  { name: "Platinum", min: 1150 }, { name: "Diamond", min: 1250 }, { name: "Top Impostor", min: 1350 },
];
export function tierFor(elo: number) { return [...TIERS].reverse().find((t) => elo >= t.min) ?? TIERS[0]; }
```

- [ ] **Step 2: `src/app/api/leaderboard/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export async function GET(req: NextRequest) {
  const sort = req.nextUrl.searchParams.get("sort") ?? "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";
  const players = await prisma.player.findMany({ orderBy: { [field]: "desc" }, take: 100 });
  return NextResponse.json(players.map((p) => ({ id: p.id, name: p.displayName, crewElo: Math.round(p.crewElo), impElo: Math.round(p.impElo), overallElo: Math.round(p.overallElo), games: p.games })));
}
```

- [ ] **Step 3: `src/components/LeaderboardTable.tsx`** (client, polls)

```tsx
"use client";
import { useEffect, useState } from "react";
import { tierFor } from "@/lib/rank";
type Row = { id: string; name: string; crewElo: number; impElo: number; overallElo: number; games: number };
export function LeaderboardTable() {
  const [sort, setSort] = useState("overall");
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`/api/leaderboard?sort=${sort}`).then((r) => r.json()).then((d) => on && setRows(d));
    load(); const id = setInterval(load, 15000);
    return () => { on = false; clearInterval(id); };
  }, [sort]);
  return (<div>
    <div className="flex gap-2 mb-4">{["overall","crew","imp"].map((s) => <button key={s} onClick={() => setSort(s)} className={s===sort?"font-bold":""}>{s}</button>)}</div>
    <table className="w-full"><thead><tr><th>#</th><th>Player</th><th>Tier</th><th>Crew</th><th>Imp</th><th>Overall</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.id}><td>{i+1}</td><td>{r.name}</td><td>{tierFor(r.overallElo).name}</td><td>{r.crewElo}</td><td>{r.impElo}</td><td>{r.overallElo}</td></tr>)}</tbody></table>
  </div>);
}
```

- [ ] **Step 4: `src/app/leaderboard/page.tsx`**

```tsx
import { LeaderboardTable } from "@/components/LeaderboardTable";
export default function Page() { return <main className="p-8"><h1 className="text-3xl mb-6">Leaderboard</h1><LeaderboardTable /></main>; }
```

- [ ] **Step 5: Verify** — `npm run dev`, visit `/leaderboard`, see seeded players; sort buttons reorder; data refreshes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: live-polling leaderboard with rank tiers"
```

---

### Task 9: Profile / stats page

**Files:**
- Create: `src/app/players/[id]/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `tierFor`.
- Produces: per-player ratings, tier, lifetime stats, recent matches with ELO deltas.

- [ ] **Step 1: `src/app/players/[id]/page.tsx`**

```tsx
import { prisma } from "@/lib/db";
import { tierFor } from "@/lib/rank";
export default async function Player({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.player.findUnique({ where: { id }, include: { participants: { include: { match: true }, orderBy: { match: { startedAt: "desc" } }, take: 10 } } });
  if (!p) return <main className="p-8">Not found</main>;
  const winRate = p.games ? Math.round(((p.crewWins + p.impWins) / p.games) * 100) : 0;
  return (<main className="p-8">
    <h1 className="text-3xl">{p.displayName}</h1>
    <p>{tierFor(p.overallElo).name} · Overall {Math.round(p.overallElo)}</p>
    <div className="grid grid-cols-3 gap-4 my-6">
      <Stat label="Crew ELO" v={Math.round(p.crewElo)} /><Stat label="Imp ELO" v={Math.round(p.impElo)} /><Stat label="Win rate" v={winRate + "%"} />
      <Stat label="Kills" v={p.kills} /><Stat label="Correct shots" v={p.correctShots} /><Stat label="Incorrect shots" v={p.incorrectShots} />
      <Stat label="Tasks done" v={p.tasksDone} /><Stat label="Crew wins" v={p.crewWins} /><Stat label="Imp wins" v={p.impWins} />
    </div>
    <h2 className="text-xl mb-2">Recent matches</h2>
    <ul>{p.participants.map((mp) => <li key={mp.id}>{mp.role} · {mp.won ? "W" : "L"} · ELO {mp.eloDelta >= 0 ? "+" : ""}{Math.round(mp.eloDelta)}</li>)}</ul>
  </main>);
}
function Stat({ label, v }: { label: string; v: string | number }) { return <div className="rounded-lg p-4" style={{ background: "var(--surface)" }}><div className="text-sm opacity-70">{label}</div><div className="text-2xl">{v}</div></div>; }
```

- [ ] **Step 2: Verify** — click a leaderboard row through to `/players/[id]`, confirm stats + recent matches.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: player stat profile with recent matches"
```

---

### Task 10: Tournament bracket logic (generation + propagation) ⭐

**Files:**
- Create: `src/lib/bracket/generate.ts`, `src/lib/bracket/report.ts`, `src/lib/bracket/bracket.test.ts`

**Interfaces:**
- Produces:
  - `generateSingleElim(playerIds: string[]): SeedMatch[]` — builds round-1 pairings + empty later rounds, wiring `winnerNextMatchId`/`winnerNextSlot`. type `SeedMatch = { localId:string; round:number; slotInRound:number; playerAId?:string; playerBId?:string; winnerNextLocalId?:string; winnerNextSlot?:"TOP"|"BOTTOM" }`.
  - `applyResult(node, winnerId): { nextMatchId?:string; nextSlot?:string; winnerId:string }` — pure helper returning where the winner advances.

- [ ] **Step 1: Failing test `src/lib/bracket/bracket.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { generateSingleElim } from "./generate";
describe("generateSingleElim", () => {
  it("creates n-1 matches for n players (power of two)", () => {
    const ms = generateSingleElim(["a","b","c","d"]);
    expect(ms.length).toBe(3);
  });
  it("round 1 holds all players", () => {
    const ms = generateSingleElim(["a","b","c","d"]);
    const r1 = ms.filter((m) => m.round === 1);
    const seated = r1.flatMap((m) => [m.playerAId, m.playerBId]).filter(Boolean);
    expect(seated.sort()).toEqual(["a","b","c","d"]);
  });
  it("round 1 winners point into round 2 slots", () => {
    const ms = generateSingleElim(["a","b","c","d"]);
    const r1 = ms.filter((m) => m.round === 1);
    expect(r1.every((m) => m.winnerNextLocalId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/lib/bracket/bracket.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/bracket/generate.ts`**

```ts
export type SeedMatch = {
  localId: string; round: number; slotInRound: number;
  playerAId?: string; playerBId?: string;
  winnerNextLocalId?: string; winnerNextSlot?: "TOP" | "BOTTOM";
};
export function generateSingleElim(playerIds: string[]): SeedMatch[] {
  const n = nextPow2(playerIds.length);
  const padded = [...playerIds, ...Array(n - playerIds.length).fill(undefined)];
  const rounds = Math.log2(n);
  const matches: SeedMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = n / Math.pow(2, r);
    for (let s = 0; s < count; s++) matches.push({ localId: `r${r}m${s}`, round: r, slotInRound: s });
  }
  // seat round 1
  const r1 = matches.filter((m) => m.round === 1);
  for (let i = 0; i < r1.length; i++) { r1[i].playerAId = padded[i * 2]; r1[i].playerBId = padded[i * 2 + 1]; }
  // wire winners forward
  for (let r = 1; r < rounds; r++) {
    const cur = matches.filter((m) => m.round === r);
    for (let s = 0; s < cur.length; s++) {
      cur[s].winnerNextLocalId = `r${r + 1}m${Math.floor(s / 2)}`;
      cur[s].winnerNextSlot = s % 2 === 0 ? "TOP" : "BOTTOM";
    }
  }
  return matches;
}
function nextPow2(x: number): number { let p = 1; while (p < x) p *= 2; return Math.max(2, p); }
```

- [ ] **Step 4: Implement `src/lib/bracket/report.ts`**

```ts
export function applyResult(node: { winnerNextMatchId?: string | null; winnerNextSlot?: string | null }, winnerId: string) {
  return { winnerId, nextMatchId: node.winnerNextMatchId ?? undefined, nextSlot: node.winnerNextSlot ?? undefined };
}
```

- [ ] **Step 5: Run, verify PASS**

Run: `npx vitest run src/lib/bracket/bracket.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: tested single-elim bracket generation + winner propagation"
```

---

### Task 11: Tournament pages + management (admin)

**Files:**
- Create: `src/app/tournaments/page.tsx`, `src/app/tournaments/[slug]/page.tsx`, `src/components/BracketView.tsx`, `src/app/api/tournaments/route.ts`, `src/app/api/tournaments/[id]/report/route.ts`, `src/lib/admin.ts`

**Interfaces:**
- Consumes: `auth()` (admin gate), `generateSingleElim`, `applyResult`, `prisma`.
- Produces: list page; detail page renders `BracketView`; admin can `POST /api/tournaments` (create + seed → persists `BracketMatch` rows from `generateSingleElim`) and `POST /api/tournaments/[id]/report` `{ bracketMatchId, winnerId }` → sets winner, writes into `winnerNextMatchId`+slot, marks tournament COMPLETE when final resolved.

- [ ] **Step 1: `src/lib/admin.ts`**

```ts
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
export async function requireAdmin() {
  const session = await auth();
  const did = (session?.user as any)?.id;
  const user = did ? await prisma.user.findUnique({ where: { discordId: String(did) } }) : null;
  return user?.isAdmin ? user : null;
}
```

- [ ] **Step 2: `src/app/api/tournaments/route.ts`** (create + persist bracket)

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSingleElim } from "@/lib/bracket/generate";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { name, slug, playerIds } = await req.json();
  const t = await prisma.tournament.create({ data: { name, slug, status: "ACTIVE" } });
  const seeds = generateSingleElim(playerIds);
  const created = await Promise.all(seeds.map((s) =>
    prisma.bracketMatch.create({ data: { tournamentId: t.id, round: s.round, slotInRound: s.slotInRound, playerAId: s.playerAId, playerBId: s.playerBId } })
  ));
  const idByLocal = new Map(seeds.map((s, i) => [s.localId, created[i].id]));
  await Promise.all(seeds.map((s, i) => s.winnerNextLocalId
    ? prisma.bracketMatch.update({ where: { id: created[i].id }, data: { winnerNextMatchId: idByLocal.get(s.winnerNextLocalId), winnerNextSlot: s.winnerNextSlot } })
    : Promise.resolve()));
  return NextResponse.json({ id: t.id, slug: t.slug });
}
```

- [ ] **Step 3: `src/app/api/tournaments/[id]/report/route.ts`** (advance winner)

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const { bracketMatchId, winnerId } = await req.json();
  const node = await prisma.bracketMatch.update({ where: { id: bracketMatchId }, data: { winnerId } });
  if (node.winnerNextMatchId) {
    await prisma.bracketMatch.update({
      where: { id: node.winnerNextMatchId },
      data: node.winnerNextSlot === "TOP" ? { playerAId: winnerId } : { playerBId: winnerId },
    });
  } else {
    await prisma.tournament.update({ where: { id }, data: { status: "COMPLETE" } });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: `src/components/BracketView.tsx`** (render rounds as columns)

```tsx
type BM = { id: string; round: number; slotInRound: number; playerAId?: string | null; playerBId?: string | null; winnerId?: string | null };
export function BracketView({ matches, names }: { matches: BM[]; names: Record<string, string> }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return (<div className="flex gap-8 overflow-x-auto">
    {rounds.map((r) => (<div key={r} className="flex flex-col gap-4">
      <h3 className="opacity-70">Round {r}</h3>
      {matches.filter((m) => m.round === r).sort((a, b) => a.slotInRound - b.slotInRound).map((m) => (
        <div key={m.id} className="rounded-lg p-3 min-w-48" style={{ background: "var(--surface)" }}>
          <Slot id={m.playerAId} win={m.winnerId} names={names} />
          <Slot id={m.playerBId} win={m.winnerId} names={names} />
        </div>))}
    </div>))}
  </div>);
}
function Slot({ id, win, names }: { id?: string | null; win?: string | null; names: Record<string, string> }) {
  return <div className={id && id === win ? "font-bold text-[var(--primary)]" : ""}>{id ? names[id] ?? id : "—"}</div>;
}
```

- [ ] **Step 5: `src/app/tournaments/page.tsx` + `[slug]/page.tsx`** (list + detail)

```tsx
// tournaments/page.tsx
import { prisma } from "@/lib/db";
import Link from "next/link";
export default async function Page() {
  const ts = await prisma.tournament.findMany({ orderBy: { createdAt: "desc" } });
  return <main className="p-8"><h1 className="text-3xl mb-6">Tournaments</h1><ul>{ts.map((t) => <li key={t.id}><Link href={`/tournaments/${t.slug}`}>{t.name} — {t.status}</Link></li>)}</ul></main>;
}
```

```tsx
// tournaments/[slug]/page.tsx
import { prisma } from "@/lib/db";
import { BracketView } from "@/components/BracketView";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, include: { bracket: true } });
  if (!t) return <main className="p-8">Not found</main>;
  const ids = [...new Set(t.bracket.flatMap((b) => [b.playerAId, b.playerBId]).filter(Boolean) as string[])];
  const players = await prisma.player.findMany({ where: { id: { in: ids } } });
  const names = Object.fromEntries(players.map((p) => [p.id, p.displayName]));
  return <main className="p-8"><h1 className="text-3xl mb-6">{t.name}</h1>{t.bannerUrl && <img src={t.bannerUrl} alt="" className="rounded-xl mb-6" />}<BracketView matches={t.bracket} names={names} /></main>;
}
```

- [ ] **Step 6: Verify** — set your user `isAdmin=true` in Prisma Studio; POST `/api/tournaments` with 4 seeded player ids; open `/tournaments/[slug]`; POST a report; confirm the winner advances into the next round.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: tournament creation, bracket view, and admin result reporting"
```

---

### Task 12: Higgsfield media + landing hero + navigation + theme polish

**Files:**
- Create: `src/components/Nav.tsx`, `public/media/` assets
- Modify: `src/app/page.tsx` (hero), `src/app/layout.tsx` (Nav), `src/app/globals.css` (polish)

**Interfaces:**
- Produces: cinematic hero (Higgsfield video) on landing; rank-tier emblem images referenced by `tierFor`; tournament banner images; site nav; cohesive blue theme.

- [ ] **Step 1: Generate media via Higgsfield** (run by the assistant, not shell): hero loop video, 6 rank-tier emblems (Bronze→Top Impostor), 2–3 tournament banners, crewmate character art — blue/space-navy palette. Save under `public/media/`.

- [ ] **Step 2: `src/components/Nav.tsx`**

```tsx
import Link from "next/link";
import { SignInButton } from "./SignInButton";
export function Nav() {
  return (<nav className="flex items-center gap-6 px-8 py-4 border-b border-white/10">
    <Link href="/" className="font-extrabold text-[var(--primary)]">Among Us .25 Ranked</Link>
    <Link href="/leaderboard">Leaderboard</Link><Link href="/tournaments">Tournaments</Link><Link href="/link">Link</Link>
    <div className="ml-auto"><SignInButton /></div>
  </nav>);
}
```

- [ ] **Step 3: Hero in `src/app/page.tsx`**

```tsx
export default function Home() {
  return (<main className="relative min-h-[80vh] flex flex-col items-center justify-center text-center overflow-hidden">
    <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-40">
      <source src="/media/hero.mp4" type="video/mp4" />
    </video>
    <div className="relative z-10">
      <h1 className="text-6xl font-extrabold tracking-tight">Among Us <span className="text-[var(--primary)]">.25 Ranked</span></h1>
      <p className="mt-4 text-xl opacity-80">Climb the Crew &amp; Impostor ladders. Prove who's really sus.</p>
    </div>
  </main>);
}
```

- [ ] **Step 4: Add `<Nav />` to `layout.tsx`; map emblem images in `rank.ts` (`image` field per tier).**

- [ ] **Step 5: Verify** — landing shows hero video + brand; nav works; leaderboard shows emblems; tournament banner renders.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Higgsfield media, hero, nav, and blue theme polish"
```

---

### Task 13: Deployment (Vercel + Neon)

**Files:**
- Create: `README.md` (setup + deploy steps), `vercel.json` (optional)

**Interfaces:**
- Produces: live site with production Postgres, Discord OAuth, and ingestion token.

- [ ] **Step 1: Provision Neon Postgres** — create a project at neon.tech, copy the pooled `DATABASE_URL`.
- [ ] **Step 2: Push schema to prod DB** — `DATABASE_URL=<neon> npx prisma migrate deploy`.
- [ ] **Step 3: Create Discord app** — add redirect `https://<your-domain>/api/auth/callback/discord`; copy client id/secret.
- [ ] **Step 4: Deploy to Vercel** — import the GitHub repo; set env vars (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `INGEST_TOKEN`, `NEXT_PUBLIC_APP_NAME`); set `AUTH_URL` to the prod URL.
- [ ] **Step 5: Smoke test prod** — sign in with Discord; POST a test match to `https://<domain>/api/ingest/match` with the bearer token; confirm it appears on the leaderboard.
- [ ] **Step 6: Write `README.md`** documenting local dev, env vars, the ingestion contract (for the future server), and deploy steps.
- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "docs: deployment + ingestion contract README"
```

---

## Self-Review

- **Spec coverage:** Discord login (T6) ✓, link code (T7) ✓, ingestion API (T4) ✓, split ELO (T3) ✓, leaderboard+polling (T8) ✓, profile/stats (T9) ✓, full bracket mgmt (T10–T11) ✓, Higgsfield media (T12) ✓, deployment/host (T13) ✓, seed via real ingestion (T5) ✓, blue theme/name (T1, T12, global constraints) ✓.
- **Double-elim note:** schema supports it (loser pointers); generation/UI implement single-elim first (T10–T11). Double-elim seeding is a follow-up task once single-elim is verified — flagged here rather than left implicit.
- **Type consistency:** `computePerf`, `updateRating`, `expectedScore`, `processMatch`, `generateSingleElim`, `applyResult`, `tierFor`, `requireAdmin` referenced with consistent signatures across tasks.
- **Placeholders:** none — each code step contains real content.
