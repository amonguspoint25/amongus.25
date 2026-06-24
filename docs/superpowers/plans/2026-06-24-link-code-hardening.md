# Link Code Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanent, standing account-link code with a short-lived, on-demand, one-time code that the user generates and can regenerate.

**Architecture:** A single link-code module (`src/lib/linkcode.ts`) owns the constants, the CSPRNG generator, the pure expiry/cooldown predicates, and two DB functions (`issueLinkCode`, `redeemLinkCode`). Sign-up stops minting codes. The `/link` page generates/regenerates via a Next.js Server Action; the bearer-gated `/api/link` route redeems via the shared DB function. One new nullable column (`linkCodeExpiresAt`) plus making `linkCode` nullable.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 + Postgres (Neon), Vitest, TypeScript.

## Global Constraints

- `LINK_CODE_TTL_MS = 15 * 60 * 1000` (15 min); `LINK_CODE_COOLDOWN_MS = 30 * 1000` (30 s) — exact values, defined once in `src/lib/linkcode.ts`.
- `linkCode` becomes nullable (`String? @unique`); `null` = no active code. Postgres allows multiple NULLs under a unique constraint.
- Exactly **one** new column: `linkCodeExpiresAt DateTime?`. No new tables, counters, locks, or Redis.
- Generation cooldown is derived (`issuedAt = linkCodeExpiresAt − TTL`) — no extra column.
- Redemption returns a **single** `404 { error: "invalid or expired code" }` for missing/expired/unknown (no existence oracle). Existing `bearerOk` 401 and `linkCode` type 400 are unchanged.
- Redemption is one-time: on success set `isLinked = true` and clear `linkCode` + `linkCodeExpiresAt`.
- Generation is a Server Action only — no new public API route.
- Tests follow repo convention: pure logic = unit tests (see `src/lib/elo/placement.test.ts`); DB logic = DB-backed tests against the Neon test branch (see `src/lib/ingest/processMatch.test.ts`); UI verified manually. Run with `npx vitest run`. The `@` alias maps to `src/` (see `vitest.config.ts`).
- Spec: `docs/superpowers/specs/2026-06-24-link-code-hardening-design.md`.

---

## File Structure

- `prisma/schema.prisma` (modify) — `linkCode` nullable, add `linkCodeExpiresAt`.
- `prisma/migrations/<ts>_link_code_hardening/migration.sql` (new) — column changes + backfill that nulls existing codes.
- `src/lib/linkcode.ts` (new) — constants, `genCode`, `isExpired`, `canRegenerate` (pure); `issueLinkCode`, `redeemLinkCode` (DB).
- `src/lib/linkcode.test.ts` (new) — unit tests for the pure parts.
- `src/lib/linkcode.db.test.ts` (new) — DB-backed tests for `issueLinkCode` / `redeemLinkCode`.
- `src/auth.ts` (modify) — `ensurePlayer()` stops minting a code; remove `genCode` + `randomInt` import.
- `src/app/api/link/route.ts` (modify) — redeem via `redeemLinkCode`; single 404.
- `src/app/link/actions.ts` (new) — `generateLinkCode` Server Action.
- `src/app/link/page.tsx` (modify) — generate/regenerate button + server-rendered expiry; show code only while active.

---

## Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (Player model: `linkCode`, add `linkCodeExpiresAt`)
- Create: `prisma/migrations/<ts>_link_code_hardening/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Player.linkCode: string | null`, `Player.linkCodeExpiresAt: Date | null` on the generated Prisma client. Later tasks rely on both being nullable.

- [ ] **Step 1: Make `linkCode` nullable and add the expiry column**

In `prisma/schema.prisma`, edit the `Player` model:

```prisma
  linkCode          String?   @unique
  linkCodeExpiresAt DateTime?
  isLinked          Boolean   @default(false)
```

(`linkCode` was `String @unique`; only the `?` and the new line are added. Leave every other field unchanged.)

- [ ] **Step 2: Generate the migration without applying it**

Run: `npx prisma migrate dev --name link_code_hardening --create-only`
Expected: a new folder `prisma/migrations/<timestamp>_link_code_hardening/migration.sql` containing roughly:

```sql
-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "linkCode" DROP NOT NULL;
ALTER TABLE "Player" ADD COLUMN     "linkCodeExpiresAt" TIMESTAMP(3);
```

- [ ] **Step 3: Append the backfill that invalidates existing codes**

Append to the generated `migration.sql`:

```sql

-- Invalidate every pre-existing standing link code. On-demand generation replaces them;
-- existing players click "Generate" once to re-link. This is the point of the feature.
UPDATE "Player" SET "linkCode" = NULL;
```

- [ ] **Step 4: Apply to the dev branch and regenerate the client**

Run: `npx prisma migrate dev`
Expected: "Already in sync" → applies the pending migration, prints `The following migration(s) have been applied`, and regenerates the Prisma Client.

- [ ] **Step 5: Apply to the Neon test branch**

The DB-backed tests run against `TEST_DIRECT_URL` (see `vitest.setup.ts`). Apply the migration there too (same as the prior `20260624152122_add_provisional_role_games` migration was applied):

Run: `DATABASE_URL="$TEST_DIRECT_URL" npx prisma migrate deploy`
(Read `TEST_DIRECT_URL` from `.env`; on PowerShell use `$env:DATABASE_URL=$env:TEST_DIRECT_URL; npx prisma migrate deploy`.)
Expected: `migrations have been applied` (or "No pending migrations" if already applied).

- [ ] **Step 6: Verify types compile against the regenerated client**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The client now types `linkCode` and `linkCodeExpiresAt` as nullable.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): link code nullable + expiry column, null out standing codes"
```

---

## Task 2: Pure link-code module

**Files:**
- Create: `src/lib/linkcode.ts`
- Test: `src/lib/linkcode.test.ts`

**Interfaces:**
- Consumes: `randomInt` from `crypto`.
- Produces:
  - `LINK_CODE_TTL_MS: number` (= 900000), `LINK_CODE_COOLDOWN_MS: number` (= 30000)
  - `genCode(): string` — 8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  - `isExpired(expiresAt: Date | null, now: Date): boolean`
  - `canRegenerate(expiresAt: Date | null, now: Date): boolean`

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/linkcode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  genCode,
  isExpired,
  canRegenerate,
  LINK_CODE_TTL_MS,
  LINK_CODE_COOLDOWN_MS,
} from "./linkcode";

describe("genCode", () => {
  it("returns 8 chars from the unambiguous alphabet", () => {
    const code = genCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
});

describe("isExpired", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  it("is true when there is no code", () => {
    expect(isExpired(null, now)).toBe(true);
  });
  it("is true at or past the expiry instant", () => {
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });
  it("is false while the code is still valid", () => {
    expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });
});

describe("canRegenerate", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const expiresFor = (issuedMsAgo: number) =>
    new Date(now.getTime() - issuedMsAgo + LINK_CODE_TTL_MS);
  it("allows when there is no code", () => {
    expect(canRegenerate(null, now)).toBe(true);
  });
  it("blocks within the cooldown of a fresh code", () => {
    expect(canRegenerate(expiresFor(0), now)).toBe(false);
    expect(canRegenerate(expiresFor(LINK_CODE_COOLDOWN_MS - 1), now)).toBe(false);
  });
  it("allows once the cooldown has passed", () => {
    expect(canRegenerate(expiresFor(LINK_CODE_COOLDOWN_MS), now)).toBe(true);
  });
  it("allows when the code has already expired", () => {
    expect(canRegenerate(new Date(now.getTime() - 1000), now)).toBe(true);
  });
});

it("locks the TTL and cooldown values", () => {
  expect(LINK_CODE_TTL_MS).toBe(15 * 60 * 1000);
  expect(LINK_CODE_COOLDOWN_MS).toBe(30 * 1000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/linkcode.test.ts`
Expected: FAIL — `Failed to resolve import "./linkcode"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/linkcode.ts`:

```ts
import { randomInt } from "crypto";

// A link code is generated on demand, valid for this window, then expires.
export const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Minimum gap between (re)generations, to throttle rapid regenerate spam.
export const LINK_CODE_COOLDOWN_MS = 30 * 1000; // 30 seconds

// The link code is a capability token redeemed in-game to bind an account, so it
// must be unguessable: use a CSPRNG (crypto.randomInt), not Math.random. The
// alphabet omits I/L/O/0/1 to stay unambiguous when read off a screen.
export function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

// A code is expired (or absent) when there is no expiry or it is at/before now.
export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

// Regeneration is allowed unless a code was issued less than the cooldown ago.
// Issue time is derived from the expiry minus the (constant) TTL — no stored column.
export function canRegenerate(expiresAt: Date | null, now: Date): boolean {
  if (expiresAt === null) return true;
  const issuedAt = expiresAt.getTime() - LINK_CODE_TTL_MS;
  return now.getTime() - issuedAt >= LINK_CODE_COOLDOWN_MS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/linkcode.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkcode.ts src/lib/linkcode.test.ts
git commit -m "feat(linkcode): pure module — genCode, isExpired, canRegenerate"
```

---

## Task 3: DB functions — issue + redeem

**Files:**
- Modify: `src/lib/linkcode.ts` (append `issueLinkCode`, `redeemLinkCode`)
- Test: `src/lib/linkcode.db.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; `genCode`, `isExpired`, `LINK_CODE_TTL_MS` from this module.
- Produces:
  - `issueLinkCode(playerId: string, now: Date): Promise<string>` — writes a fresh code + `linkCodeExpiresAt = now + TTL`, retrying on unique collision; returns the code.
  - `redeemLinkCode(linkCode: string, now: Date): Promise<{ ok: true; playerId: string } | { ok: false }>` — links the player and clears the code if valid and unexpired; otherwise `{ ok: false }`.

- [ ] **Step 1: Write the failing DB test**

Create `src/lib/linkcode.db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { issueLinkCode, redeemLinkCode, LINK_CODE_TTL_MS } from "./linkcode";

async function makePlayer(tag: string) {
  const user = await prisma.user.create({ data: { discordId: tag, username: tag } });
  return prisma.player.create({ data: { userId: user.id, displayName: tag } });
}

describe("issueLinkCode / redeemLinkCode", () => {
  beforeEach(async () => {
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
  });

  it("issues a code with the expected expiry", async () => {
    const p = await makePlayer("issue1");
    const now = new Date("2026-06-24T12:00:00Z");
    const code = await issueLinkCode(p.id, now);
    const row = await prisma.player.findUnique({ where: { id: p.id } });
    expect(row!.linkCode).toBe(code);
    expect(row!.linkCodeExpiresAt!.getTime()).toBe(now.getTime() + LINK_CODE_TTL_MS);
  });

  it("redeems a valid code: links the player and clears the code", async () => {
    const p = await makePlayer("redeem1");
    const now = new Date();
    const code = await issueLinkCode(p.id, now);
    const res = await redeemLinkCode(code, now);
    expect(res).toEqual({ ok: true, playerId: p.id });
    const row = await prisma.player.findUnique({ where: { id: p.id } });
    expect(row!.isLinked).toBe(true);
    expect(row!.linkCode).toBeNull();
    expect(row!.linkCodeExpiresAt).toBeNull();
  });

  it("rejects an expired code and does not link", async () => {
    const p = await makePlayer("redeem2");
    const issuedAt = new Date("2026-06-24T12:00:00Z");
    const code = await issueLinkCode(p.id, issuedAt);
    const later = new Date(issuedAt.getTime() + LINK_CODE_TTL_MS + 1000);
    const res = await redeemLinkCode(code, later);
    expect(res).toEqual({ ok: false });
    const row = await prisma.player.findUnique({ where: { id: p.id } });
    expect(row!.isLinked).toBe(false);
  });

  it("rejects an unknown / already-used code", async () => {
    const res = await redeemLinkCode("NOSUCH99", new Date());
    expect(res).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/linkcode.db.test.ts`
Expected: FAIL — `issueLinkCode is not a function` / import does not resolve `issueLinkCode`.

- [ ] **Step 3: Append the implementation**

Append to `src/lib/linkcode.ts`:

```ts
import { prisma } from "@/lib/db";

// Mint a fresh code for the player and stamp its expiry. linkCode is @unique; on the
// (astronomically rare) collision, regenerate and retry rather than fail the request.
export async function issueLinkCode(playerId: string, now: Date): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      await prisma.player.update({
        where: { id: playerId },
        data: { linkCode: code, linkCodeExpiresAt: new Date(now.getTime() + LINK_CODE_TTL_MS) },
      });
      return code;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002" && attempt < 4) continue; // linkCode collision
      throw err;
    }
  }
  throw new Error("could not issue a unique link code");
}

// Redeem a code: if it exists and is unexpired, link the player and clear the code
// (one-time use). Returns { ok: false } for missing, expired, or already-used codes —
// the caller maps all of these to a single response (no existence oracle).
export async function redeemLinkCode(
  linkCode: string,
  now: Date,
): Promise<{ ok: true; playerId: string } | { ok: false }> {
  const player = await prisma.player.findUnique({ where: { linkCode } });
  if (!player || isExpired(player.linkCodeExpiresAt, now)) return { ok: false };
  await prisma.player.update({
    where: { id: player.id },
    data: { isLinked: true, linkCode: null, linkCodeExpiresAt: null },
  });
  return { ok: true, playerId: player.id };
}
```

(Move the new `import { prisma }` to the top of the file with the other import if your linter prefers; functionally either placement is fine.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/linkcode.db.test.ts`
Expected: PASS (4 tests green).

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: PASS (all prior tests + the two new files).

- [ ] **Step 6: Commit**

```bash
git add src/lib/linkcode.ts src/lib/linkcode.db.test.ts
git commit -m "feat(linkcode): issueLinkCode + redeemLinkCode with DB tests"
```

---

## Task 4: Stop minting codes at sign-up

**Files:**
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: new players are created with `linkCode = null` (no standing code). No exported signature changes.

- [ ] **Step 1: Simplify `ensurePlayer` and drop the generator**

In `src/auth.ts`, remove the `import { randomInt } from "crypto";` line and the `genCode` function (it now lives in `src/lib/linkcode.ts`). Replace `ensurePlayer` with:

```ts
// Ensures a Player exists for the user, idempotently. Players start with no link
// code; they generate one on demand from /link. The only collision possible here is
// a concurrent sign-in creating the same userId — treat that as success.
async function ensurePlayer(userId: string, displayName: string): Promise<void> {
  const existing = await prisma.player.findUnique({ where: { userId } });
  if (existing) return;
  try {
    await prisma.player.create({ data: { userId, displayName } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return; // userId created by a concurrent sign-in
    throw err;
  }
}
```

Leave the rest of `auth.ts` (the `NextAuth({ ... })` config and callbacks) unchanged.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS — `player.create` no longer requires `linkCode` (it is nullable), and there are no unused-import errors.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: PASS (sign-up path unaffected; DB tests still green).

- [ ] **Step 4: Commit**

```bash
git add src/auth.ts
git commit -m "feat(auth): players no longer get a standing link code at sign-up"
```

---

## Task 5: Redeem via the shared DB function

**Files:**
- Modify: `src/app/api/link/route.ts`

**Interfaces:**
- Consumes: `redeemLinkCode` from `@/lib/linkcode`; `bearerOk` from `@/lib/serverAuth`.
- Produces: no exported signature changes. Behavior: expiry-aware redemption, single 404 for invalid/expired.

- [ ] **Step 1: Rewrite the route to use `redeemLinkCode`**

Replace the body of `src/app/api/link/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { bearerOk } from "@/lib/serverAuth";
import { redeemLinkCode } from "@/lib/linkcode";

// Called by the trusted game server when a player redeems their link code in-game.
export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const linkCode = body?.linkCode;
  if (typeof linkCode !== "string") {
    return NextResponse.json({ error: "linkCode required" }, { status: 400 });
  }
  const result = await redeemLinkCode(linkCode, new Date());
  if (!result.ok) {
    // Single response for missing / expired / already-used — no existence oracle.
    return NextResponse.json({ error: "invalid or expired code" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, playerId: result.playerId });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Confirm redemption behavior is covered**

The redemption semantics (valid / expired / unknown) are covered by `src/lib/linkcode.db.test.ts` from Task 3. Re-run to confirm: `npx vitest run src/lib/linkcode.db.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/link/route.ts
git commit -m "feat(api): redeem link codes with expiry + one-time use; single 404"
```

---

## Task 6: Generate action + /link UI

**Files:**
- Create: `src/app/link/actions.ts`
- Modify: `src/app/link/page.tsx`

**Interfaces:**
- Consumes: `auth` from `@/auth`; `prisma` from `@/lib/db`; `canRegenerate`, `issueLinkCode`, `isExpired` from `@/lib/linkcode`; `CopyButton` from `@/components/CopyButton`.
- Produces: `generateLinkCode(): Promise<void>` Server Action (default form action). UI shows a code only while active; otherwise a generate button.

> **Note (YAGNI):** the displayed expiry is server-rendered (an absolute time), not a live ticking countdown. A ticking countdown would require a new client component; it is intentionally omitted. Revisit only if desired.

- [ ] **Step 1: Create the Server Action**

Create `src/app/link/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canRegenerate, issueLinkCode } from "@/lib/linkcode";

// Generate (or regenerate) the signed-in user's link code. Regenerating replaces any
// existing code immediately. Throttled by a short cooldown derived from the expiry.
export async function generateLinkCode(): Promise<void> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/link");

  const player = await prisma.player.findFirst({ where: { user: { discordId } } });
  if (!player) redirect("/link");

  const now = new Date();
  if (!canRegenerate(player.linkCodeExpiresAt, now)) redirect("/link?slow=1");

  await issueLinkCode(player.id, now);
  revalidatePath("/link");
}
```

- [ ] **Step 2: Update the page to generate/display on demand**

Replace `src/app/link/page.tsx` with:

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { isExpired } from "@/lib/linkcode";
import { generateLinkCode } from "./actions";

export const metadata = { title: "Link account — Among Us .25 Ranked" };

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ slow?: string }>;
}) {
  const { slow } = await searchParams;
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="eyebrow mb-1">// SECURE UPLINK</p>
        <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
        <p className="data" style={{ color: "var(--muted)" }}>Sign in with Discord to get your link code.</p>
      </main>
    );
  }

  const player = await prisma.player.findFirst({ where: { user: { discordId } } });
  const isLinked = player?.isLinked ?? false;
  const now = new Date();
  const hasActiveCode = !!player?.linkCode && !isExpired(player.linkCodeExpiresAt, now);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// SECURE UPLINK</p>
      <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
      <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
        {hasActiveCode ? (
          <>
            <p className="eyebrow mb-2">Your link code (one-time, expires soon)</p>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", margin: "0.5rem 0 1rem" }}>
              <p
                className="glow-num"
                style={{ fontSize: "2rem", letterSpacing: "0.35em", color: "var(--signal)", textShadow: "var(--glow-cyan)", margin: 0 }}
              >
                {player!.linkCode}
              </p>
              <CopyButton value={player!.linkCode!} />
            </div>
            <p className="data" style={{ color: "var(--muted)" }}>
              Expires at {player!.linkCodeExpiresAt!.toLocaleTimeString()}. Redeem it on the .25 server in-game.
            </p>
            <form action={generateLinkCode} style={{ marginTop: "1rem" }}>
              <button className="btn-ghost" type="submit" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.4rem 0.9rem" }}>
                REGENERATE
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="eyebrow mb-2">Link code</p>
            <p className="data" style={{ color: "var(--muted)", margin: "0.5rem 0 1rem" }}>
              {isLinked
                ? "✓ Linked. Generate a new code only if you need to re-link."
                : "Generate a one-time code, then redeem it on the .25 server in-game."}
            </p>
            <form action={generateLinkCode}>
              <button className="btn-ghost" type="submit" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.4rem 0.9rem" }}>
                GENERATE LINK CODE
              </button>
            </form>
          </>
        )}
        {slow && (
          <p className="data" style={{ color: "var(--warn, #e0a04d)", marginTop: "1rem" }}>
            Slow down — wait a moment before generating another code.
          </p>
        )}
      </div>
      <Link href="/leaderboard" className="eyebrow inline-block mt-6" style={{ color: "var(--muted)" }}>← Leaderboard</Link>
    </main>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification on the dev server**

Run: `npm run dev`, sign in, visit `/link`.
Expected:
1. With no/expired code → a "GENERATE LINK CODE" button; no code shown.
2. Click it → an 8-char code + "Expires at …" + a "REGENERATE" button appear.
3. Click "REGENERATE" immediately → redirected to `/link?slow=1`, "Slow down …" note shows, code unchanged.
4. (Optional) redeem the code via the game-server `/api/link` call → on next `/link` load the code is gone and the linked note shows.

- [ ] **Step 5: Commit**

```bash
git add src/app/link/actions.ts src/app/link/page.tsx
git commit -m "feat(link): on-demand generate/regenerate UI with server-rendered expiry"
```

---

## Self-Review

**Spec coverage:**
- On-demand generation → Task 6 (action + button). ✅
- 15-min TTL → `LINK_CODE_TTL_MS`, applied in `issueLinkCode` (Tasks 2–3). ✅
- Regenerate kills old code → `issueLinkCode` overwrites `linkCode` (Task 3); UI button (Task 6). ✅
- One-time consumption → `redeemLinkCode` clears code (Task 3); route (Task 5). ✅
- 30-s cooldown, derived, no new column → `canRegenerate` (Task 2), enforced in action (Task 6). ✅
- `linkCode` nullable + single new `linkCodeExpiresAt` column → Task 1. ✅
- Migration nulls existing codes → Task 1, Step 3. ✅
- Sign-up stops minting → Task 4. ✅
- Single 404 invalid/expired, 401/400 unchanged → Task 5. ✅
- Tests: pure unit + DB-backed; UI manual → Tasks 2, 3, 6. ✅
- Non-goals (no new tables/counters/route, no live countdown) → respected; countdown omission flagged in Task 6. ✅

**Placeholder scan:** No TBD/TODO; every code/test step has complete code; `<ts>` in the migration path is the Prisma-generated timestamp (Step 2 creates it), not an unfilled blank.

**Type consistency:** `genCode`, `isExpired`, `canRegenerate`, `issueLinkCode(playerId, now)`, `redeemLinkCode(linkCode, now) → { ok, playerId? }` are named and typed identically across Tasks 2, 3, 5, 6. `Player.linkCode: string | null` and `Player.linkCodeExpiresAt: Date | null` (Task 1) match every consumer.
