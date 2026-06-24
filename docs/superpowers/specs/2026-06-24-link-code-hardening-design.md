# Link Code Hardening — Design

**Date:** 2026-06-24
**Branch:** feat/initial-build
**Mode:** built lean (ponytail / YAGNI)

## Goal

Replace the permanent, standing account-link code with a short-lived, on-demand one.

Today every player gets an 8-char `linkCode` (`@unique`, CSPRNG) generated at sign-up
and displayed forever. It never expires, rotates, or gets revoked — a permanent
credential sitting on every row. This change makes the code:

- **On-demand** — no code exists until the user clicks "Generate".
- **Short-lived** — 15-minute TTL.
- **Replaceable** — "Regenerate" issues a new code and kills the old one instantly.
- **One-time** — cleared on successful redemption.
- **Lightly throttled** — a 30-second generation cooldown, derived from existing data (no new counters).

## Current implementation (context)

- `prisma/schema.prisma` → `Player.linkCode String @unique`, `Player.isLinked Boolean @default(false)`.
- `src/auth.ts` → `ensurePlayer()` calls `genCode()` (8 chars, `crypto.randomInt`) at sign-up,
  inside a 5-attempt collision-retry loop.
- `src/app/link/page.tsx` → server component; displays `player.linkCode` permanently + `CopyButton`.
- `src/app/api/link/route.ts` → `POST`, bearer-gated via `bearerOk`; game server sends `{ linkCode }`;
  looks up the player and sets `isLinked = true`. No expiry, no consumption, no throttle.

## Approach

On-demand generation + short TTL, implemented with the minimum surface area.

### Schema (`prisma/schema.prisma`, `Player`)

- `linkCode String? @unique` — now **nullable**; `null` = no active code.
  (Postgres permits multiple `NULL`s under a unique constraint, so unlinked players coexist.)
- `linkCodeExpiresAt DateTime?` — the **only** new column; `null` = no active code.
- **Migration** (`prisma/migrations/<ts>_link_code_hardening/migration.sql`):
  1. `ALTER COLUMN "linkCode" DROP NOT NULL`
  2. add `linkCodeExpiresAt`
  3. **`UPDATE "Player" SET "linkCode" = NULL`** — invalidate every pre-existing standing code,
     so no permanent code survives the change. (This is the point of the feature; existing
     players click "Generate" once to re-link.)

### Sign-up change (`src/auth.ts`)

`ensurePlayer()` stops setting `linkCode` — new players are created with `linkCode` unset (`null`)
and no code until they generate one. The 5-attempt collision-retry loop is no longer needed for
sign-up (no unique `linkCode` is written there); the create becomes a plain insert, and the only
remaining retry concern is the `userId` P2002 from concurrent sign-ins (already handled).

### Constants + pure helpers (`src/lib/linkcode.ts`, new) — unit tested

- `LINK_CODE_TTL_MS = 15 * 60 * 1000` (15 min)
- `LINK_CODE_COOLDOWN_MS = 30 * 1000` (30 s)
- `isExpired(expiresAt: Date | null, now: Date): boolean` — `true` if `expiresAt` is null or `<= now`.
- `canRegenerate(expiresAt: Date | null, now: Date): boolean` — derives `issuedAt = expiresAt - TTL`;
  returns `false` only if a code was issued less than the cooldown ago; `true` when there is no
  code, it has expired, or it is older than the cooldown.
- `genCode(): string` — **moves here** from `auth.ts` (8 chars, `crypto.randomInt`). After this change
  `ensurePlayer()` no longer generates a code at sign-up, so `auth.ts` no longer needs it; the Generate
  action imports it from this module. Not duplicated.

The cooldown needs **no extra column**: since the TTL is constant, issue time = `expiresAt - TTL`.

### Generate (Next.js Server Action, session-authed)

A small server action (e.g. `src/app/link/actions.ts`), called from a client button on `/link`:

1. Require a session via `auth()`; resolve the player by `discordId` (same lookup the page uses).
2. Cooldown: if `!canRegenerate(player.linkCodeExpiresAt, now)` → return `{ error: "slow down" }`.
3. Generate `genCode()`; set `linkCode` + `linkCodeExpiresAt = now + LINK_CODE_TTL_MS`,
   with a 5-attempt collision-retry loop — the same pattern previously in `ensurePlayer`,
   now applied here since this is where a unique code is written.
4. `revalidatePath("/link")`.

Rationale for a Server Action over a new API route: it runs server-side with the session already
in scope (no new authenticated public surface to harden), it is the idiomatic App Router pattern,
and it keeps the public API limited to the bearer-gated `/api/link` the game server calls.

### Display (`src/app/link/page.tsx`)

- Active, non-expired code → show the code + a live countdown + a "Regenerate" button.
- Otherwise → a "Generate link code" button.
- The page stays a server component that reads player state; a small client component owns the
  button, the inline "slow down" message, and the countdown timer.

### Redeem (`src/app/api/link/route.ts`, bearer-gated)

- Keep the existing `bearerOk` → 401 and the `linkCode` type check → 400.
- Look up by `linkCode`; if not found **or** `isExpired(player.linkCodeExpiresAt, now)` →
  **single** `404 { error: "invalid or expired code" }`.
- On success: set `isLinked = true` and clear `linkCode` + `linkCodeExpiresAt` (one-time use).

## Error handling

- **Generate:** no session → existing `/link` guard; cooldown hit → inline `{ error: "slow down" }`
  (no new error infrastructure). Collision → existing retry loop.
- **Redeem:** one `404 { error: "invalid or expired code" }` for missing/expired/unknown — a single
  response avoids an existence oracle (does not reveal whether a code once existed). 401/400 unchanged.

## Testing

Matches repo convention (pure + DB-backed; UI verified manually — no component tests exist).

- **Unit** (`src/lib/linkcode.test.ts`): `isExpired` and `canRegenerate` across null / expired /
  fresh / within-cooldown / past-cooldown. Mirrors `src/lib/elo/placement.test.ts`.
- **DB-backed** (`src/app/api/link` redemption): valid code redeems and is cleared; expired code
  rejected (404); already-used / null code rejected (404). Mirrors the `processMatch` DB tests.
- **Manual:** generate → countdown ticks → regenerate invalidates the previous code → redeem links;
  confirm a pre-migration player has no code and must click "Generate".

## Non-goals (YAGNI)

- No new tables; no rate-limit counters, locks, or Redis.
- No DB-backed redemption-attempt counter — `/api/link` is already bearer-gated.
- No link-code history / audit log.
- No configurable TTL via env or UI — constants live in code.
- No separate generate API route — Server Action only.
- HMAC anti-cheat on match ingestion stays deferred-by-design to the server contract (out of scope).

## Security notes

- Eliminates a standing permanent credential on every player row — the core win.
- One invalid/expired response removes the existence oracle.
- Generation is session-scoped: a user can only affect their own row.
- Redemption remains bearer-gated to the trusted game server.
