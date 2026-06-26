# Game-Watcher (Ranked Host Mod) — Design Spec

**Date:** 2026-06-26
**Status:** Approved (brainstorming), pending implementation plan
**Scope:** The missing piece of the ranked system — the component that captures
real Among Us games and feeds them to this website's existing ingestion API. Has
**two parts**: (1) small website changes for per-host keys + a ranked control
panel, and (2) the Among Us mod itself.

---

## 1. Context

This website (`among-us-25-ranked`) is already a complete read-model + ELO + ingest
backend. Its README states it expects *"a custom Among Us server (built separately)"*
to `POST` finished matches to `/api/ingest/match`. **This spec is that custom
server** — implemented as a **host-side Among Us mod** (the only mobile-inclusive
capture method; see prior project design).

Established facts:
- Among Us is **host-authoritative**: the lobby host's client knows every player's
  secret role, kills, votes, and tasks — including unmodded mobile/console players.
  So **only the host runs the mod**; everyone else joins by code and installs nothing.
- Identity is **Discord ID** with a link-code flow already built here: a player signs
  in (Discord), gets a one-time code (`Player.linkCode`), and redeems it. `/api/link`
  returns `{ ok, playerId, discordId, displayName }`. Only `isLinked` players' stats count.
- The ingest contract (`src/lib/ingest/schema.ts`) is fixed and authoritative.

### Existing models this builds on (`prisma/schema.prisma`)
- `User { id, discordId @unique, username, isAdmin }`
- `Player { userId, displayName, linkCode, isLinked, crewElo, impElo, ... }`
- `Match { code @unique, ... }`, `MatchParticipant { role, won, kills, correctShots, incorrectShots, tasksDone, tasksTotal, survived, ... }`
- Enums `Outcome { CREW_WIN, IMP_WIN }`, `Role { CREW, IMPOSTOR }`

---

## 2. Decisions (locked in brainstorming)

1. **Capture model:** BepInEx + Reactor **host-only** PC mod. Games run on official
   Among Us servers via a normal join code; mobile/console/PC players install nothing.
2. **Host auth:** **personal key per host** (revocable), not one shared secret.
3. **Ranked control:** a **website host panel** — an approved host clicks
   "Start ranked," and the mod **polls** the site to learn it's armed. No in-game toggle.
4. **Linking:** player types their one-time code in **lobby chat**; the mod reads it,
   calls `/api/link`, and caches `in-game player → discordId` for the session.
5. **Mod structure:** split into a thin **Game Reader** (the only Among Us-dependent
   part) and a pure **Match Brain** (all logic; unit-testable without the game).

---

## 3. Architecture

```
   WEBSITE (this repo, + Part 1 additions)
      ▲ arm/disarm (host, Discord-auth)     ▲ link        ▲ ingest match
      │ POST /api/host/arm|disarm           │ /api/link    │ /api/ingest/match
      │ GET  /api/host/status (mod polls) ──┘ (Bearer host key on the two mod-facing calls)
      │
   THE MOD (host's PC, inside Among Us)            [Part 2]
      ├─ Game Reader (thin, Among Us-only): Harmony patches → normalized events
      │     GameStarted(roster+roles) · PlayerKilled · MeetingEnded(ejected, per-player votes)
      │     TaskCompleted · TasksAssigned · ChatMessage · GameEnded(outcome)
      │     + renders the "RANKED: ON" on-screen label
      └─ Match Brain (pure, testable here):
            • ArmState: polls GET /api/host/status → armed?
            • LinkManager: chat code → POST /api/link → cache inGameId↔discordId
            • MatchRecorder: accumulates events into a per-player tally (only when armed)
            • MatchBuilder: tally + link map → exact MatchPayload
            • Sender: POST with Bearer host key; on failure, local queue + retry (idempotent)
```

---

## 4. Part 1 — Website changes (build + test here first)

### 4.1 Data model
Add to `prisma/schema.prisma`:

```prisma
model HostKey {
  id          String    @id @default(cuid())
  host        User      @relation(fields: [hostUserId], references: [id])
  hostUserId  String
  label       String                  // e.g. "Cole's PC"
  tokenHash   String    @unique       // sha256(secret); raw shown once at creation
  tokenPrefix String                  // first ~8 chars for display
  armedUntil  DateTime?               // ranked ON until this time (auto-expire); null = off
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
}
```
Add to `User`: `isHost Boolean @default(false)` and `hostKeys HostKey[]`.

**Key handling:** generate a high-entropy secret (e.g. `amrk_<32 random chars>`),
store only its **sha256 hash**, return the raw value **once**. Lookups hash the
presented bearer and compare (timing-safe), reject if `revokedAt != null`.

### 4.2 Auth changes (`src/lib/serverAuth.ts`)
- Keep `bearerOk` (single `INGEST_TOKEN`) for demo seeding / backward-compat.
- Add `resolveHostKey(authHeader): Promise<HostKey | null>` — timing-safe hash
  lookup, not revoked; on success bump `lastUsedAt`.
- `/api/ingest/match` and `/api/link` accept **either** a valid `INGEST_TOKEN`
  **or** a valid host key. (Match ingestion is otherwise unchanged.)

### 4.3 Endpoints
- `POST /api/host/arm` — auth: signed-in `isHost` user. Sets `armedUntil = now + 6h`
  (auto-expire so a forgotten session turns itself off). Returns `{ armedUntil }`.
- `POST /api/host/disarm` — clears `armedUntil`.
- `GET /api/host/status` — auth: **Bearer host key** (this is what the mod polls).
  Returns `{ armed: boolean, armedUntil: string | null }`.
- Admin: mint/revoke keys + toggle `isHost` (server actions or `/api/admin/hosts`).

### 4.4 UI
- `/host` (visible to `isHost`): shows the host's key status, a big **Start / Stop
  ranked** button, and a live "armed until" countdown.
- `/admin/hosts` (admin): list users, flag `isHost`, **Create key** (shows secret
  once), **Revoke**.

### 4.5 Part 1 testing (vitest, here)
- Key mint → hash stored, raw returned once, prefix correct.
- `resolveHostKey`: valid key resolves; revoked key rejected; bad key rejected; timing-safe.
- `/api/ingest/match` accepts a valid host key and still accepts `INGEST_TOKEN`.
- arm → `status` shows armed; expiry past `armedUntil` → not armed; disarm → not armed.

---

## 5. Part 2 — The mod (scaffold here, real-game test on PC)

### 5.1 Projects
- `GameWatcher.Core` — **pure .NET** (no Among Us refs). All of the Match Brain.
  **Unit-tested here with xUnit.**
- `GameWatcher.Plugin` — **BepInEx + Reactor** plugin. The thin Game Reader +
  on-screen label. References Among Us interop assemblies; only compiles/tests on a
  machine with the game. Based on a proven host-only Reactor mod template.

### 5.2 Config (BepInEx config file)
`WebsiteBaseUrl` and `HostKey` (the host pastes their personal key once). A one-click
installer drops the plugin + config into the Among Us BepInEx folder.

### 5.3 Normalized events (the Game Reader → Brain interface)
```
GameStarted(matchCode, map, startedAt, roster: [{ inGameId, name, role }])
TasksAssigned(inGameId, taskCount)        // crew task totals; impostors = 0
PlayerKilled(killerInGameId, victimInGameId, atMs)
TaskCompleted(inGameId, atMs)
MeetingEnded(ejectedInGameId | null, votes: [{ voterInGameId, targetInGameId | null }])
ChatMessage(senderInGameId, text)
GameEnded(outcome: CREW_WIN | IMP_WIN, endedAt)
```
The Reader produces these; the Brain consumes them. This boundary is what makes the
Brain testable without Among Us.

### 5.4 Match Brain behavior
- **ArmState:** poll `GET /api/host/status` every few seconds; cache `armed`. At
  `GameStarted`, snapshot `armed` — if false, ignore the whole game.
- **LinkManager:** on `ChatMessage` whose text matches the link-code format, call
  `POST /api/link`; on `{ ok, discordId }`, cache `senderInGameId → discordId` for
  the session. (Already-linked players can be re-confirmed the same way.)
- **MatchRecorder** (armed games only): per in-game player, derive
  - `role` (from roster), `won` (role vs outcome), `survived` (not killed/ejected),
  - `kills` (PlayerKilled where killer = them),
  - `correctShots` / `incorrectShots` (their votes targeting an IMPOSTOR vs CREW),
  - `tasksDone` (TaskCompleted count), `tasksTotal` (from TasksAssigned),
  - optional `timeToKillMs` / `timeToTaskMs` — **deferred** (schema-optional).
- **MatchBuilder:** map in-game players → `discordId` via LinkManager; **drop
  unlinked players** (no discordId). Build the exact `MatchPayload`. **Guard:** if
  dropping unlinked players leaves zero CREW or zero IMPOSTOR (the schema requires
  ≥1 of each), do **not** send — surface a clear "not everyone linked" warning to
  the host instead.
- **Sender:** `POST /api/ingest/match` with `Authorization: Bearer <host key>`. On
  network/5xx failure, append the payload to a local queue file and retry with
  backoff. `matchCode` is unique → re-sends are safe no-ops (server idempotency).

### 5.5 matchCode
Unique per ranked game: e.g. `<lobbyCode>-<startedAt epoch>` or a GUID. Guarantees the
server's `Match.code` uniqueness / idempotency.

### 5.6 Part 2 testing
- **Brain (here, xUnit):** feed a scripted event stream (a full fake game) → assert the
  produced `MatchPayload` matches `schema.ts` exactly; link flow caches correctly;
  unarmed games produce nothing; missing-role guard fires; Sender queues + retries on
  failure and is idempotent. ~80% of mod logic verified without the game.
- **Reader + end-to-end (host's PC):** install the plugin, host real lobbies, and
  confirm matches appear on the leaderboard. A written host checklist accompanies it.

---

## 6. Error handling & edge cases
- **Failed sends** never lose a match: local queue + retry; idempotent by `matchCode`.
- **Unlinked players** are skipped (server already does this); if a *whole role* is
  unlinked, the mod refuses to send and warns the host (§5.4 guard).
- **Website unreachable mid-game:** arm state is snapshotted at game start, so the game
  still records and the send queues until the site is back.
- **Key leak:** revoke that host's key (`revokedAt`); all other hosts keep working.
- **Among Us update breaks the Reader:** rebuild the Plugin (Core is unaffected).

---

## 7. Scope

**In scope:** Part 1 (host keys + panel + arm/status) and Part 2 (Core brain + Plugin
reader) capturing role/won/kills/correct+incorrect votes/tasks/survived/outcome.

**Deferred (YAGNI / harder):** precise `timeToKillMs` / `timeToTaskMs`; Discord-login
host auth (the no-key option) — revisit if hosting grows; tournament-match tagging
from the mod; cryptographic per-event signing.

**Out of scope:** changes to ELO math or the leaderboard (already done on the website).

---

## 8. Build order
1. **Part 1 — website host keys + panel + status** (here; vitest). The mod has real
   endpoints to talk to.
2. **Part 2a — `GameWatcher.Core` brain** (here; xUnit). Most of the mod, fully tested.
3. **Part 2b — `GameWatcher.Plugin` reader + installer** (scaffold here; real-game
   test on the host's PC).

## 9. Open questions (carry into planning)
1. Exact Reactor template / current Among Us version interop to target — confirm during planning (research pass).
2. Link-code format to match on in chat (read from `linkcode.ts` so the mod's regex matches the website's issued codes).
3. Whether `/host` arming should be tied to a specific lobby code (extra safety) or just a per-host armed flag (v1 default: per-host flag).
