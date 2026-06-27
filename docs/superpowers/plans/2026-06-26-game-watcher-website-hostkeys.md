# Game-Watcher Part 1 — Website Host Keys + Ranked Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-host revocable API keys and a website "ranked" arm/disarm panel so the (separately-built) Among Us mod can authenticate and learn when to record.

**Architecture:** A new `HostKey` model (sha256-hashed secret, raw shown once) and a `User.isHost` flag. Pure crypto helpers + thin Prisma wrappers in `src/lib/hostkey.ts`. The existing `/api/ingest/match` and `/api/link` accept a valid host key in addition to `INGEST_TOKEN`. A mod-facing `GET /api/host/status` reports armed state; a `/host` panel (server actions) arms/disarms; an `/admin/hosts` page mints/revokes keys and flags hosts.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7 + `@prisma/adapter-pg` (PostgreSQL/Neon), Auth.js v5 (Discord), Vitest. Matches existing `src/lib/linkcode.ts` + `src/lib/serverAuth.ts` patterns.

## Global Constraints

- **Hashing:** store only `sha256(rawSecret)`; return the raw secret **once** at creation. Never store or log the raw key. (Spec §4.1)
- **Fail closed:** unknown / revoked / malformed keys are rejected; `/api/host/status` with no valid key → `401`. (Spec §4.2–4.3)
- **Backward compat:** the existing single `INGEST_TOKEN` must keep working on `/api/ingest/match` and `/api/link` (used by demo seeding). (Spec §4.2)
- **Arming auto-expires:** `armedUntil = now + 6h`; a key is "armed" only while `armedUntil > now`. (Spec §4.3)
- **Identity:** arming is gated on a signed-in `User` with `isHost = true`; minting/revoking on `isAdmin`. (Spec §4.3–4.4)
- **Follow existing patterns:** `prisma` from `@/lib/db`; sessions via `auth()` where `session.user.id` is the **discordId**; admin via `requireAdmin()` from `@/lib/admin`; server actions like `src/app/link/actions.ts`.

---

## Prerequisites (environment)

DB-backed tests and migrations need a PostgreSQL the engineer can write to (the
existing `*.db.test.ts` files already require this). Pure-logic tests (Task 2) need
no database.

- [ ] Ensure `.env` has `DATABASE_URL` + `DIRECT_URL` (a dev/test Postgres — a Neon
  **test branch** is ideal) and `TEST_DIRECT_URL`/`TEST_DATABASE_URL` for DB tests.
  A local Postgres also works (`winget install PostgreSQL.PostgreSQL`, then point the
  URLs at it). **Do not** run migrations or tests against the production database.
- [ ] Confirm `npx prisma generate` runs cleanly before starting.

---

## File Structure

```
prisma/schema.prisma                 # + HostKey model, + User.isHost / hostKeys
prisma/migrations/<ts>_add_host_keys # generated
src/lib/hostkey.ts                   # pure crypto helpers + Prisma wrappers (NEW)
src/lib/hostkey.test.ts              # pure unit tests (NO db) (NEW)
src/lib/hostkey.db.test.ts           # DB-backed tests (NEW)
src/app/api/ingest/match/route.ts    # accept host key (MODIFY)
src/app/api/link/route.ts            # accept host key (MODIFY)
src/app/api/host/status/route.ts     # mod polls armed state (NEW)
src/app/host/page.tsx                # host panel (NEW)
src/app/host/actions.ts              # armRanked / disarmRanked (NEW)
src/app/admin/hosts/page.tsx         # admin: hosts + keys (NEW)
src/app/admin/hosts/actions.ts       # mint / revoke / setHost (NEW)
src/components/HostKeyReveal.tsx      # client: show a minted key once (NEW)
```

---

### Task 1: Prisma model — HostKey + User.isHost

**Files:**
- Modify: `prisma/schema.prisma`
- Create (generated): `prisma/migrations/<timestamp>_add_host_keys/`

**Interfaces:**
- Produces: Prisma model `HostKey { id, hostUserId, label, tokenHash @unique, tokenPrefix, armedUntil?, revokedAt?, lastUsedAt?, createdAt }`; `User.isHost: boolean`, `User.hostKeys: HostKey[]`.

- [ ] **Step 1: Add the model and field**

In `prisma/schema.prisma`, add `isHost` + relation to `model User` (keep existing fields):

```prisma
model User {
  id        String   @id @default(cuid())
  discordId String   @unique
  username  String
  avatar    String?
  isAdmin   Boolean  @default(false)
  isHost    Boolean  @default(false)
  player    Player?
  hostKeys  HostKey[]
  createdAt DateTime @default(now())
}
```

Add a new model at the end of the file:

```prisma
model HostKey {
  id          String    @id @default(cuid())
  host        User      @relation(fields: [hostUserId], references: [id])
  hostUserId  String
  label       String
  tokenHash   String    @unique
  tokenPrefix String
  armedUntil  DateTime?
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@index([hostUserId])
}
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run: `npx prisma migrate dev --name add_host_keys`
Expected: a new folder under `prisma/migrations/`, and "Your database is now in sync". `@prisma/client` regenerates (so `prisma.hostKey` exists).

- [ ] **Step 3: Verify the client compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `hostKey` / `isHost`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): HostKey model + User.isHost"
```

---

### Task 2: Pure host-key crypto helpers (runnable anywhere, no DB)

**Files:**
- Create: `src/lib/hostkey.ts` (pure exports only for now)
- Test: `src/lib/hostkey.test.ts`

**Interfaces:**
- Produces (pure):
  - `genHostKey(): { raw: string; tokenHash: string; tokenPrefix: string }`
  - `hashToken(raw: string): string` (sha256 hex)
  - `parseBearer(authHeader: string | null): string | null`
  - `isArmed(armedUntil: Date | null, now: Date): boolean`
  - const `HOST_ARM_TTL_MS = 21_600_000`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hostkey.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { genHostKey, hashToken, parseBearer, isArmed, HOST_ARM_TTL_MS } from "./hostkey";

describe("host key crypto", () => {
  it("genHostKey returns a prefixed raw secret, its sha256 hash, and a display prefix", () => {
    const { raw, tokenHash, tokenPrefix } = genHostKey();
    expect(raw.startsWith("amrk_")).toBe(true);
    expect(raw.length).toBeGreaterThanOrEqual(24);
    expect(tokenHash).toBe(hashToken(raw));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.startsWith(tokenPrefix)).toBe(true);
    expect(tokenPrefix.length).toBeLessThan(raw.length);
  });

  it("genHostKey is unique per call", () => {
    expect(genHostKey().raw).not.toBe(genHostKey().raw);
  });

  it("hashToken is deterministic and differs for different inputs", () => {
    expect(hashToken("a")).toBe(hashToken("a"));
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("parseBearer extracts the token after 'Bearer '", () => {
    expect(parseBearer("Bearer abc123")).toBe("abc123");
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
  });

  it("isArmed is true only while armedUntil is in the future", () => {
    const now = new Date("2026-06-26T12:00:00Z");
    expect(isArmed(null, now)).toBe(false);
    expect(isArmed(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isArmed(new Date(now.getTime() - 1000), now)).toBe(false);
  });

  it("HOST_ARM_TTL_MS is 6 hours", () => {
    expect(HOST_ARM_TTL_MS).toBe(6 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/hostkey.test.ts`
Expected: FAIL — `./hostkey` cannot be resolved.

- [ ] **Step 3: Write the pure helpers**

Create `src/lib/hostkey.ts`:

```ts
import { createHash, randomBytes } from "crypto";

export const HOST_ARM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const KEY_PREFIX = "amrk_";
const PREFIX_DISPLAY_LEN = 12;

/** A new host key: the raw secret (shown once), its sha256 hash (stored), and a short display prefix. */
export function genHostKey(): { raw: string; tokenHash: string; tokenPrefix: string } {
  const raw = KEY_PREFIX + randomBytes(24).toString("base64url"); // ~32 url-safe chars
  return { raw, tokenHash: hashToken(raw), tokenPrefix: raw.slice(0, PREFIX_DISPLAY_LEN) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Extract the token from an `Authorization: Bearer <token>` header, or null. */
export function parseBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer (.+)$/);
  return m && m[1].length > 0 ? m[1] : null;
}

export function isArmed(armedUntil: Date | null, now: Date): boolean {
  return armedUntil !== null && armedUntil.getTime() > now.getTime();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/hostkey.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hostkey.ts src/lib/hostkey.test.ts
git commit -m "feat(hostkey): pure crypto helpers (gen/hash/parse/armed) with tests"
```

---

### Task 3: Prisma host-key functions (create / resolve / revoke / arm / disarm / status / authorize)

**Files:**
- Modify: `src/lib/hostkey.ts` (append DB functions)
- Test: `src/lib/hostkey.db.test.ts` (DB-backed)

**Interfaces:**
- Consumes: pure helpers from Task 2; `prisma` from `@/lib/db`; `bearerOk` from `@/lib/serverAuth`.
- Produces:
  - `createHostKey(hostUserId: string, label: string): Promise<{ id: string; raw: string; tokenPrefix: string }>`
  - `resolveHostKey(authHeader: string | null): Promise<HostKey | null>` (bumps `lastUsedAt`)
  - `revokeHostKey(id: string): Promise<void>`
  - `armHost(hostUserId: string, now: Date): Promise<Date>` (sets `armedUntil` on the host's non-revoked keys)
  - `disarmHost(hostUserId: string): Promise<void>`
  - `hostStatus(authHeader: string | null, now: Date): Promise<{ armed: boolean; armedUntil: Date | null } | null>`
  - `authorizeIngest(authHeader: string | null): Promise<boolean>`

- [ ] **Step 1: Write the failing DB tests**

Create `src/lib/hostkey.db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import {
  createHostKey, resolveHostKey, revokeHostKey,
  armHost, disarmHost, hostStatus, authorizeIngest,
} from "./hostkey";

async function makeHost(tag: string) {
  return prisma.user.create({ data: { discordId: tag, username: tag, isHost: true } });
}

describe("host key DB functions", () => {
  beforeEach(async () => {
    await prisma.hostKey.deleteMany();
    await prisma.user.deleteMany();
  });

  it("createHostKey stores a hash (not the raw) and returns the raw once", async () => {
    const host = await makeHost("h1");
    const { id, raw, tokenPrefix } = await createHostKey(host.id, "Cole PC");
    const row = await prisma.hostKey.findUnique({ where: { id } });
    expect(row!.tokenHash).not.toBe(raw);          // raw never stored
    expect(row!.tokenPrefix).toBe(tokenPrefix);
    expect(row!.label).toBe("Cole PC");
  });

  it("resolveHostKey returns the key for a valid bearer and bumps lastUsedAt", async () => {
    const host = await makeHost("h2");
    const { raw } = await createHostKey(host.id, "PC");
    const key = await resolveHostKey(`Bearer ${raw}`);
    expect(key?.hostUserId).toBe(host.id);
    expect(key?.lastUsedAt).not.toBeNull();
  });

  it("resolveHostKey rejects unknown and revoked keys", async () => {
    const host = await makeHost("h3");
    const { id, raw } = await createHostKey(host.id, "PC");
    expect(await resolveHostKey("Bearer amrk_nope")).toBeNull();
    await revokeHostKey(id);
    expect(await resolveHostKey(`Bearer ${raw}`)).toBeNull();
  });

  it("armHost arms the host's keys; status reflects armed then disarmed", async () => {
    const host = await makeHost("h4");
    const { raw } = await createHostKey(host.id, "PC");
    const now = new Date();

    let status = await hostStatus(`Bearer ${raw}`, now);
    expect(status).toEqual({ armed: false, armedUntil: null });

    const armedUntil = await armHost(host.id, now);
    status = await hostStatus(`Bearer ${raw}`, now);
    expect(status!.armed).toBe(true);
    expect(status!.armedUntil!.getTime()).toBe(armedUntil.getTime());

    // an armed key reads as not-armed once armedUntil has passed
    const later = new Date(armedUntil.getTime() + 1000);
    expect((await hostStatus(`Bearer ${raw}`, later))!.armed).toBe(false);

    await disarmHost(host.id);
    expect((await hostStatus(`Bearer ${raw}`, now))!.armed).toBe(false);
  });

  it("hostStatus returns null when the key is invalid", async () => {
    expect(await hostStatus("Bearer amrk_bad", new Date())).toBeNull();
  });

  it("authorizeIngest accepts a host key and still accepts INGEST_TOKEN", async () => {
    const host = await makeHost("h5");
    const { raw } = await createHostKey(host.id, "PC");
    expect(await authorizeIngest(`Bearer ${raw}`)).toBe(true);

    const prev = process.env.INGEST_TOKEN;
    process.env.INGEST_TOKEN = "demo-token";
    expect(await authorizeIngest("Bearer demo-token")).toBe(true);
    expect(await authorizeIngest("Bearer wrong")).toBe(false);
    process.env.INGEST_TOKEN = prev;
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/hostkey.db.test.ts`
Expected: FAIL — `createHostKey` etc. are not exported.

- [ ] **Step 3: Append the DB functions to `src/lib/hostkey.ts`**

```ts
import { prisma } from "@/lib/db";
import { bearerOk } from "@/lib/serverAuth";
import type { HostKey } from "@prisma/client";

export async function createHostKey(
  hostUserId: string,
  label: string,
): Promise<{ id: string; raw: string; tokenPrefix: string }> {
  const { raw, tokenHash, tokenPrefix } = genHostKey();
  const row = await prisma.hostKey.create({ data: { hostUserId, label, tokenHash, tokenPrefix } });
  return { id: row.id, raw, tokenPrefix };
}

export async function resolveHostKey(authHeader: string | null): Promise<HostKey | null> {
  const raw = parseBearer(authHeader);
  if (!raw) return null;
  const key = await prisma.hostKey.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!key || key.revokedAt) return null;
  await prisma.hostKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}

export async function revokeHostKey(id: string): Promise<void> {
  await prisma.hostKey.update({ where: { id }, data: { revokedAt: new Date(), armedUntil: null } });
}

export async function armHost(hostUserId: string, now: Date): Promise<Date> {
  const armedUntil = new Date(now.getTime() + HOST_ARM_TTL_MS);
  await prisma.hostKey.updateMany({ where: { hostUserId, revokedAt: null }, data: { armedUntil } });
  return armedUntil;
}

export async function disarmHost(hostUserId: string): Promise<void> {
  await prisma.hostKey.updateMany({ where: { hostUserId, revokedAt: null }, data: { armedUntil: null } });
}

export async function hostStatus(
  authHeader: string | null,
  now: Date,
): Promise<{ armed: boolean; armedUntil: Date | null } | null> {
  const key = await resolveHostKey(authHeader);
  if (!key) return null;
  return { armed: isArmed(key.armedUntil, now), armedUntil: key.armedUntil };
}

export async function authorizeIngest(authHeader: string | null): Promise<boolean> {
  if (bearerOk(authHeader)) return true; // keep INGEST_TOKEN for demo/seed paths
  return (await resolveHostKey(authHeader)) !== null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/hostkey.db.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hostkey.ts src/lib/hostkey.db.test.ts
git commit -m "feat(hostkey): create/resolve/revoke/arm/disarm/status/authorize with DB tests"
```

---

### Task 4: Accept host keys on `/api/ingest/match` and `/api/link`

**Files:**
- Modify: `src/app/api/ingest/match/route.ts`
- Modify: `src/app/api/link/route.ts`

**Interfaces:**
- Consumes: `authorizeIngest` from `@/lib/hostkey` (Task 3).

- [ ] **Step 1: Update the ingest route**

Replace the auth check in `src/app/api/ingest/match/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeIngest } from "@/lib/hostkey";
import { matchPayloadSchema } from "@/lib/ingest/schema";
import { processMatch } from "@/lib/ingest/processMatch";

export async function POST(req: NextRequest) {
  if (!(await authorizeIngest(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = matchPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await processMatch(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
```

- [ ] **Step 2: Update the link route**

In `src/app/api/link/route.ts`, change the import and the guard only:

```ts
import { authorizeIngest } from "@/lib/hostkey";
// ...
  if (!(await authorizeIngest(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
```
(Leave the rest of `link/route.ts` unchanged.)

- [ ] **Step 3: Verify the build/types**

Run: `npx tsc --noEmit`
Expected: no errors. (`authorizeIngest` is async; both routes already `await` it.)

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — existing ingest/link tests still green (the `INGEST_TOKEN` path is preserved) plus the new hostkey tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ingest/match/route.ts src/app/api/link/route.ts
git commit -m "feat(api): accept per-host keys on ingest + link (INGEST_TOKEN still works)"
```

---

### Task 5: Mod-facing `GET /api/host/status`

**Files:**
- Create: `src/app/api/host/status/route.ts`
- Test: `src/app/api/host/status/route.db.test.ts`

**Interfaces:**
- Consumes: `hostStatus` from `@/lib/hostkey` (Task 3); `createHostKey`, `armHost` for the test.
- Produces: `GET /api/host/status` → `200 { armed, armedUntil }` for a valid key, else `401`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/host/status/route.db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createHostKey, armHost } from "@/lib/hostkey";
import { GET } from "./route";

function req(auth: string | null) {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("http://test/api/host/status", { headers }) as unknown as import("next/server").NextRequest;
}

describe("GET /api/host/status", () => {
  beforeEach(async () => {
    await prisma.hostKey.deleteMany();
    await prisma.user.deleteMany();
  });

  it("returns 401 without a valid key", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it("returns armed=false then armed=true after the host arms", async () => {
    const host = await prisma.user.create({ data: { discordId: "s1", username: "s1", isHost: true } });
    const { raw } = await createHostKey(host.id, "PC");

    let res = await GET(req(`Bearer ${raw}`));
    expect(res.status).toBe(200);
    expect((await res.json()).armed).toBe(false);

    await armHost(host.id, new Date());
    res = await GET(req(`Bearer ${raw}`));
    expect((await res.json()).armed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/host/status/route.db.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Write the route**

Create `src/app/api/host/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { hostStatus } from "@/lib/hostkey";

// Polled by the host mod (Authorization: Bearer <host key>) to learn if ranked is on.
export async function GET(req: NextRequest) {
  const status = await hostStatus(req.headers.get("authorization"), new Date());
  if (!status) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ armed: status.armed, armedUntil: status.armedUntil });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/api/host/status/route.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/host/status
git commit -m "feat(api): GET /api/host/status for the host mod to poll armed state"
```

---

### Task 6: Host panel (`/host`) — arm / disarm

**Files:**
- Create: `src/app/host/actions.ts`
- Create: `src/app/host/page.tsx`

**Interfaces:**
- Consumes: `armHost`, `disarmHost`, `isArmed` from `@/lib/hostkey`; `auth` from `@/auth`; `prisma`.

- [ ] **Step 1: Write the server actions**

Create `src/app/host/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { armHost, disarmHost } from "@/lib/hostkey";

async function currentHostUserId(): Promise<string | null> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return null;
  const user = await prisma.user.findUnique({ where: { discordId } });
  return user?.isHost ? user.id : null;
}

export async function armRanked(): Promise<void> {
  const id = await currentHostUserId();
  if (!id) redirect("/");
  await armHost(id, new Date());
  revalidatePath("/host");
}

export async function disarmRanked(): Promise<void> {
  const id = await currentHostUserId();
  if (!id) redirect("/");
  await disarmHost(id);
  revalidatePath("/host");
}
```

- [ ] **Step 2: Write the page**

Create `src/app/host/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isArmed } from "@/lib/hostkey";
import { armRanked, disarmRanked } from "./actions";

export default async function HostPage() {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/");
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { hostKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!user?.isHost) redirect("/");

  const now = new Date();
  const armedUntil = user.hostKeys.map((k) => k.armedUntil).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const armed = isArmed(armedUntil, now);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Ranked host panel</h1>
      <p className="mt-2 text-sm opacity-70">
        Arm ranked before you start hosting. Your mod records games while this is on.
      </p>

      <div className={`mt-6 rounded-xl border p-6 ${armed ? "border-emerald-400" : "border-zinc-600"}`}>
        <div className="text-lg font-semibold">
          RANKED: {armed ? "ON" : "OFF"}
        </div>
        {armed && armedUntil && (
          <div className="text-sm opacity-70">auto-off at {armedUntil.toLocaleTimeString()}</div>
        )}
        <div className="mt-4 flex gap-3">
          <form action={armRanked}>
            <button className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-black" disabled={armed}>
              Start ranked
            </button>
          </form>
          <form action={disarmRanked}>
            <button className="rounded-lg bg-zinc-700 px-4 py-2 font-medium" disabled={!armed}>
              Stop ranked
            </button>
          </form>
        </div>
      </div>

      {user.hostKeys.length === 0 && (
        <p className="mt-4 text-sm text-amber-400">
          You have no host key yet — ask an admin to create one for you.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify build + type-check**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/host` compiles.

- [ ] **Step 4: Manual smoke (with a DB + dev server)**

Run: `npm run dev`, sign in, set your `User.isHost = true` (`npx prisma studio`), open `/host`, click **Start ranked** → label flips to ON; with your key, `GET /api/host/status` returns `armed: true`.

- [ ] **Step 5: Commit**

```bash
git add src/app/host
git commit -m "feat(host): /host panel to arm/disarm ranked"
```

---

### Task 7: Admin hosts page (`/admin/hosts`) — flag hosts, mint + revoke keys

**Files:**
- Create: `src/app/admin/hosts/actions.ts`
- Create: `src/app/admin/hosts/page.tsx`
- Create: `src/components/HostKeyReveal.tsx`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/admin`; `createHostKey`, `revokeHostKey` from `@/lib/hostkey`; `prisma`.

- [ ] **Step 1: Write the admin actions**

Create `src/app/admin/hosts/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { createHostKey, revokeHostKey } from "@/lib/hostkey";

export async function setHost(userId: string, isHost: boolean): Promise<void> {
  if (!(await requireAdmin())) return;
  await prisma.user.update({ where: { id: userId }, data: { isHost } });
  revalidatePath("/admin/hosts");
}

// Returns the raw key ONCE so the page can show it; it is never retrievable again.
export async function mintHostKey(userId: string, label: string): Promise<string | null> {
  if (!(await requireAdmin())) return null;
  const { raw } = await createHostKey(userId, label || "host");
  revalidatePath("/admin/hosts");
  return raw;
}

export async function revokeKey(id: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await revokeHostKey(id);
  revalidatePath("/admin/hosts");
}
```

- [ ] **Step 2: Write the reveal client component**

Create `src/components/HostKeyReveal.tsx`:

```tsx
"use client";
import { useState } from "react";
import { mintHostKey } from "@/app/admin/hosts/actions";

export function HostKeyReveal({ userId }: { userId: string }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <form
        action={async () => {
          const r = await mintHostKey(userId, label);
          setRaw(r);
        }}
        className="flex gap-2"
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label (e.g. Cole PC)"
          className="rounded bg-zinc-800 px-2 py-1 text-sm"
        />
        <button className="rounded bg-blue-500 px-3 py-1 text-sm font-medium text-black">Create key</button>
      </form>
      {raw && (
        <code className="select-all rounded bg-black/60 p-2 text-xs text-emerald-300">
          {raw}  ← copy now; it won&apos;t be shown again
        </code>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the admin page**

Create `src/app/admin/hosts/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { setHost, revokeKey } from "./actions";
import { HostKeyReveal } from "@/components/HostKeyReveal";

export default async function AdminHostsPage() {
  if (!(await requireAdmin())) redirect("/");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { hostKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Hosts &amp; keys</h1>
      <ul className="mt-6 space-y-4">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl border border-zinc-700 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{u.username}</span>
              <form action={setHost.bind(null, u.id, !u.isHost)}>
                <button className="rounded bg-zinc-700 px-3 py-1 text-sm">
                  {u.isHost ? "Remove host" : "Make host"}
                </button>
              </form>
            </div>
            {u.isHost && (
              <div className="mt-3 space-y-2">
                {u.hostKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between text-sm">
                    <code className="opacity-70">{k.tokenPrefix}… {k.armedUntil ? "(armed)" : ""}</code>
                    <form action={revokeKey.bind(null, k.id)}>
                      <button className="rounded bg-red-600/80 px-2 py-0.5 text-xs">Revoke</button>
                    </form>
                  </div>
                ))}
                <HostKeyReveal userId={u.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Verify build + type-check**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke**

As an admin (`User.isAdmin = true`), open `/admin/hosts`: make a user a host, **Create key** → the raw key shows once; copy it; paste it as a Bearer token to `GET /api/host/status` → `200`. **Revoke** → same key now `401`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/hosts src/components/HostKeyReveal.tsx
git commit -m "feat(admin): /admin/hosts to flag hosts and mint/revoke keys"
```

---

## Deferred to later plans

- **Plan #2:** `GameWatcher.Core` (the mod's pure brain) — built + unit-tested here.
- **Plan #3:** `GameWatcher.Plugin` (BepInEx/Reactor reader) + installer — real-game tested on a PC.
- Discord-login host auth (no key to paste); tying arming to a specific lobby code; precise time-to-kill/task capture. (Spec §7)

---

## Plan Self-Review (done by author)

- **Spec coverage:** §4.1 model → Task 1. §4.1 hashing/keygen → Task 2. §4.2 resolve/authorize + backward-compat → Tasks 3–4. §4.3 arm/disarm/status + auto-expire → Tasks 3, 5, 6. §4.4 UI (host panel + admin) → Tasks 6–7. Spec §5 (the mod) is explicitly a later plan.
- **Type consistency:** `genHostKey/hashToken/parseBearer/isArmed/HOST_ARM_TTL_MS` (Task 2) and `createHostKey/resolveHostKey/revokeHostKey/armHost/disarmHost/hostStatus/authorizeIngest` (Task 3) are used with identical signatures in Tasks 4–7.
- **Placeholder scan:** none — every code step has complete code; every test step has runnable assertions and an exact command.
- **Known execution constraint:** Tasks 1, 3, 5 and the manual smokes need a writable Postgres (not prod). Task 2 runs with no DB. Flagged in Prerequisites.
