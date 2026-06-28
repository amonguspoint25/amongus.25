# Game-Watcher Plugin & Ranked Ruleset (Plan #3) — Design Spec

**Date:** 2026-06-28
**Status:** Approved (brainstorming), pending implementation plan
**Depends on:** Plan #1 (host keys + status, merged to `main`), Plan #2 (`GameWatcher.Core` brain, on `feat/game-watcher-core`)
**Supersedes (in part):** the arm/disarm language in `2026-06-26-game-watcher-design.md` — replaced by the tri-state `RankedGate` (see §3).

---

## 1. Summary

Plan #3 is the in-game half of the ranked system: a **host-only BepInEx + Reactor mod**
(`GameWatcher.Plugin`) that watches real Among Us games, feeds the already-built
`GameWatcher.Core` brain, and POSTs finished matches to `/api/ingest/match`. On top of
pure capture, this plan adds the **ranked ruleset** the community wants:

- an **18-minute task deadline** that force-ends the game as an impostor win,
- a **pre-start gate** that blocks ranked unless every player is linked and the lobby is on the ranked settings preset,
- a new **`roundsSurvived`** stat + **time-to-kill/task** capture feeding ELO,
- **post-game ELO deltas** announced in chat.

The mod is **host-only and host-authoritative**: only the lobby host installs it; everyone
else (PC/mobile/console) joins by code and installs nothing. The host's client is ground
truth for roles, kills, votes, tasks, friend codes, and game settings.

## 2. Scope

**In scope:**
- `GameWatcher.Plugin` (BepInEx 6 IL2CPP + Reactor, x86): the thin **Game Reader**, the
  **BrainHost** composition root, the **RANKED HUD label + timer countdown**, the
  **pre-start gate**, the **ranked timer**, config, and a **one-click installer**.
- Additive changes to `GameWatcher.Core` (the brain): `RoundsSurvived`, `RankedTimer`,
  time-to-kill/task derivation, roster-based link resolution. All unit-tested with xUnit.
- Website changes: ingest schema + Prisma migration for `roundsSurvived`; `perf.ts` +
  `processMatch.ts` for the new stat and time-based perf; `/api/ingest/match` returns
  per-player `eloDelta`.

**Out of scope / excluded (owner's call this round):**
- Host match controls (void-match hotkey + local audit log).
- Disconnect-scoring policy.
- Sabotage stats.
- In-lobby rank/ELO display.

**Deferred (revisit later):**
- Chat-code linking also capturing friend codes (so chat-linkers pass the gate).
- Lifetime `roundsSurvived` total on `Player`/`PlayerSeason` (profile stat).
- Cryptographic per-event signing; tournament-match tagging from the mod.

## 3. Architecture

The seam between the game and the brain is a single method on the already-built
`MatchSession`:

```
MatchSession.HandleAsync(GameEvent e, CancellationToken ct) -> SessionOutcome
```

The Reader's entire job is to construct normalized `GameEvent` records and pump them in;
the brain does linking, recording, building, validation, queueing, and sending.

```
THE MOD (host's PC, inside Among Us)
  ├─ Game Reader (thin, AU-only): Harmony patches → plain GameEvent records (main thread)
  ├─ Pre-start gate (lobby): /api/lobby/roster all-linked + GameOptions settings-lock
  ├─ Ranked timer (host): 18-min task deadline → force IMP_WIN on expiry
  ├─ RANKED HUD: status label + timer countdown; chat announcements
  └─ BrainHost (composition root):
        builds RankedGate · LinkManager · MatchRecorder · MatchBuilder · Sender · MatchSession
        background worker drains an event queue → await MatchSession.HandleAsync
        status poll loop → volatile label state

WEBSITE (this repo, already built unless noted)
  GET  /api/host/status     → 200 {valid:true} / 401  (RankedGate: Enabled/Disabled/Unknown)
  POST /api/lobby/roster    → friend codes → {matched:[{inGameId,playerId,displayName}], unmatched:[inGameId]}
  POST /api/link            → chat code → {ok,playerId,discordId,displayName}  (legacy, optional)
  POST /api/ingest/match    → idempotent by matchCode; returns per-player eloDelta (NEW)
```

**Ranked status model (replaces arm/disarm):** `RankedGate` polls `GET /api/host/status` →
`Enabled` (200, key valid), `Disabled` (401, key invalid → game is casual), `Unknown`
(any other → site blip; record optimistically per the brain's existing rule). There is no
server-side arm/disarm toggle; ranked eligibility comes from a valid host key.

**What makes a game ranked (activation rule):** the mod is "ranked-active" when
`RankedEnabled` (local config, default `true`) **and** a `HostKey` is configured **and**
`RankedGate != Disabled`. Only while ranked-active do the pre-start gate, the timer, and
recording apply; otherwise the mod is **dormant** (HUD `OFF`, no gate/timer/recording) and
the host plays a normal game. To play casually on a ranked rig, the host flips `RankedEnabled`
off (via the host-only `/ranked off` lobby-chat command) or clears the key. This replaces the
removed "Start ranked" arm button with a purely local switch — no server round-trip to toggle.

**`/ranked` chat command (host-only):** the host types `/ranked on` / `/ranked off` in lobby chat
to flip `RankedEnabled` at runtime (`/ranked` alone reports current state). Only the local player
(the host) can toggle — other players' `/ranked` is ignored. The mod replies in chat so the whole
(unmodded) lobby sees the ranked state. The host key remains the auth boundary; `/ranked` is only
the local intent toggle. The RANKED HUD label stays as the always-on visual indicator.

## 4. Project layout & build

```
game-watcher/
  GameWatcher.slnx                       # add the plugin project
  src/GameWatcher.Core/                  # EXISTING brain — additive changes only (§10, §8, §11, §12)
  src/GameWatcher.Plugin/                # NEW
    GameWatcher.Plugin.csproj            # net6.0, PlatformTarget x86, ProjectReference → Core
    GameWatcherPlugin.cs                 # BasePlugin entry: config, composition, register patches, start loops
    Config/PluginConfig.cs               # WebsiteBaseUrl, HostKey, RankedPreset, TimerMinutes (default 18)
    Composition/BrainHost.cs             # builds Core components; queue + background worker; status poll; volatile state
    Reader/
      PlayerRef.cs                       # Il2Cpp player → (inGameId, name, role, friendCode, puid) on main thread
      GameLifecyclePatches.cs            # GameStarted (roster+roles+tasks), GameEnded
      KillPatches.cs                     # PlayerKilled
      MeetingPatches.cs                  # MeetingEnded (ejected + votes); meeting open/close → timer pause/resume
      TaskPatches.cs                     # TaskCompleted
      ChatPatches.cs                     # ChatMessage
    Ranked/
      LobbyGate.cs                       # validation loop: roster all-linked + settings-lock; cached verdict
      RankedTimerController.cs           # drives Core RankedTimer; force-end on expiry; chat announcements
    Ui/RankedHud.cs                      # RANKED label + MM:SS countdown (HudManager.Update, main thread)
    Debug/DebugInjector.cs              # F9 → scripted fake game through the real plugin → brain → leaderboard
  installer/
    install.ps1                          # auto-detect game, fetch pinned BepInEx+Reactor, deploy, configure
    Install-RankedMod.bat                # double-click wrapper → powershell -ExecutionPolicy Bypass -File install.ps1
```

**Target environment (confirmed on this machine):** Among Us at
`C:\Program Files (x86)\Steam\steamapps\common\Among Us`, **x86 (32-bit)**, Unity
**2022.3.44f1**, **IL2CPP** (`GameAssembly.dll`), Steam buildid `23244517`, no BepInEx yet.

**Deps:** `net6.0`, `<PlatformTarget>x86</PlatformTarget>`. NuGet: `BepInEx.Unity.IL2CPP`
(6.x), `BepInEx.PluginInfoProps`, `Reactor`, `AmongUs.GameLibs.Steam` (version matched to
buildid `23244517` — the one build-time lookup), `Il2CppInterop.Runtime`. `ProjectReference`
→ `GameWatcher.Core` (net6.0 consumes netstandard2.1 cleanly). Plugin + `GameWatcher.Core.dll`
ship to `BepInEx/plugins/`. `AmongUs.GameLibs.Steam` is **compile-time only**; runtime types
come from BepInEx's generated interop.

## 5. Reader — event → Harmony hook map

Each patch runs on Unity's main thread, reads game state into a **plain `GameEvent` record**,
and calls `BrainHost.Enqueue(e)` — nothing else. Exact method signatures are confirmed
against the generated interop at build time (these are the canonical AU hook points).

| Event | Hook point | Reads → record |
|---|---|---|
| `GameStarted` | end of `IntroCutscene` (roles revealed) | game code + start epoch → `matchCode`; map; `startedAt`; roster of every `PlayerControl` → `{inGameId=PlayerId, name, role}` |
| `TasksAssigned` | same point | per crew player `Data.Tasks.Count`; impostors = 0 |
| `PlayerKilled` | `PlayerControl.MurderPlayer` | `PlayerKilled(killerId, victimId, atMs)` (atMs = now − startedAt) |
| `TaskCompleted` | `PlayerControl.CompleteTask` / RPC | `TaskCompleted(id, atMs)` |
| `MeetingEnded` | `MeetingHud.VotingComplete(states, exiled, tie)` | `exiled?.PlayerId`; each state `VoterId→VotedFor` (255/skip → null) → `MeetingEnded(ejected?, votes[])` |
| `ChatMessage` | `ChatController.AddChat(source, text)` | `ChatMessage(source.PlayerId, text)` (host sees all chat → link codes) |
| `GameEnded` | `AmongUsClient.OnGameEnd` / `EndGameResult` | `GameOverReason` → `CREW_WIN`/`IMP_WIN`; `endedAt` |

`matchCode = "{gameCode}-{startedAtEpochSec}"` (unique → server idempotency). All derived
stats (`correctShots`/`incorrectShots`/`won`/`survived`/`roundsSurvived`/time-to-*) are
computed **by the brain**, never the reader.

## 6. BrainHost — composition & threading

```
Harmony patch (MAIN thread)              background worker (Task)
  read Il2Cpp → plain GameEvent  ──►  ConcurrentQueue ──►  await MatchSession.HandleAsync(e)
  BrainHost.Enqueue(e)                                       └─► update volatile label/recording state

status poll loop (Task, ~5s) ─► RankedGate.GetStatusAsync ─► volatile status state
RankedHud (MAIN thread, HudManager.Update) ◄── reads volatile state → sets label + timer text
```

- `BrainHost` builds, from config: `HttpClientTransport` → `RankedGate`, `LinkManager`,
  `MatchRecorder`, `MatchBuilder`, `Sender` → `MatchSession`. Owns the event queue, the
  background worker, the status poll loop, and a `volatile` snapshot of
  `{status, recording, lastOutcome, timerRemainingMs, timerPaused}`.
- **The one hard rule:** Il2Cpp objects are read into plain records **on the main thread**
  before enqueue. The worker only ever touches plain records + HTTP, so the game never
  freezes on a network call, and no game object is touched off-thread (that would crash AU).
- UI mutation (label/countdown) stays on the main thread (`HudManager.Update` reads the
  volatile snapshot).

## 7. RANKED HUD

A corner `TextMeshPro` element added to `HudManager`, updated each `HudManager.Update`:

| State | Label |
|---|---|
| no host key configured | `RANKED: OFF — no key` |
| key invalid / 401 (`Disabled`) | `RANKED: OFF` |
| status unresolved / poll offline (`Unknown`, idle) | `RANKED: ? (offline)` |
| key valid (`Enabled`), in lobby | `RANKED READY ✓` / `RANKED BLOCKED: <reasons>` (from the gate, §9) |
| recording (`Enabled`) | `● REC` + `MM:SS` countdown |
| recording on `Unknown` | `● REC (unverified)` + `MM:SS` |
| meeting open | countdown shows `PAUSED` |
| game end refused (whole role unlinked) | flash `⚠ not everyone linked` |

## 8. Ranked 18-minute task deadline

**Rule:** on a ranked game start, set an **18:00** timer (config: `TimerMinutes`, default 18).
It counts down during active play and **pauses whenever a meeting/vote is open**. On expiry,
if the crew hasn't finished all tasks (`GameData.CompletedTasks < GameData.TotalTasks`), the
host **force-ends the game as an impostor win**. If crew finishes tasks first, or the game
ends any other way, the timer cancels.

| Piece | Where | Job |
|---|---|---|
| `RankedTimer` | **Core (pure, unit-tested)** | `Reset(ms)`, `Tick(deltaMs)` (decrements only while running), `Pause()`/`Resume()`, `RemainingMs`, `JustExpired` (fires once). Edge cases: pause-while-paused, resume-without-pause, expiry at a meeting boundary. |
| `RankedTimerController` | **Plugin** | On `GameStarted`(ranked) → `Reset`. Each frame outside a meeting → `Tick(Δ)`. Meeting open → `Pause()`, close → `Resume()`. On `JustExpired` → read tasks; if incomplete → `GameManager.RpcEndGame(<impostor-win reason>, showAd:false)`. |

The forced end flows through the same `OnGameEnd` hook the reader watches → recorded as a
normal `IMP_WIN`; no special-casing. Edge: if `TotalTasks == 0` (degenerate, no tasks), the
timer does **not** force an end. Only the host runs the timer; non-hosts are informed via chat
at meetings (§9 / §11). Controller is wrapped `try/catch` — a timer bug must never crash the game.

## 9. Pre-start gate (settings lock + hard all-linked gate)

A **lobby validation loop** runs every few seconds while in the lobby and produces a cached
verdict shown on the HUD:

1. **All-linked (hard gate):** read each lobby player's `friendCode` + `puid` + `inGameId`
   (host-readable, including mobile/console) → `POST /api/lobby/roster` (Bearer host key).
   If `unmatched` is non-empty → **blocked** (`not linked: <names>`). On success, the
   `matched` array (`inGameId → playerId`) seeds the brain's link map for the game.
2. **Settings lock:** read `GameOptions` → compare to the ranked preset (impostor count,
   task counts, kill cooldown, map, etc.) + a minimum player count. Off-preset → **blocked**
   (`settings off-preset: <detail>`).

A **prefix patch on `GameStartManager.BeginGame`** reads the cached verdict: if the game would
be ranked and the verdict isn't ready, it **cancels the start** and flashes the reason. The
HTTP/settings work stays in the loop; the patch only reads a cached bool, so it never blocks
the frame.

**Consequence (confirmed):** "linked on the website" means the player **registered their
friend code** (`/link` → `setFriendCode`, which sets `friendCode` + `isLinked`). Ranked
therefore **requires friend-code registration**. The chat-code flow (`/api/link`) remains as
optional legacy and is not the ranked gate mechanism.

## 10. New stat: `roundsSurvived` (cross-cutting)

**Definition:** number of meeting rounds where the player was **alive at meeting start and
not the ejected player**. For an impostor (who only dies by ejection) that's meetings dodged
before being voted out, or all meetings if never ejected. Derived purely from events the
brain already receives.

| Layer | Change |
|---|---|
| Brain — `MatchRecorder` | on each `MeetingEnded`, for every still-alive non-ejected player, `roundsSurvived++` (alive tracked from `PlayerKilled` + prior ejections, as `survived` already is) |
| Brain — `Wire.Participant` + `GameWatcherJson` | add `RoundsSurvived` (int) → serializes as `roundsSurvived` |
| Website — ingest zod (`schema.ts`) | `roundsSurvived: z.number().int().min(0).optional()` — consumers read `?? 0`; DB column carries `@default(0)` (back-compat: omitted → 0) |
| Website — Prisma | `MatchParticipant.roundsSurvived Int @default(0)` + one migration |
| Website — `perf.ts` | `PerfStats` gains `roundsSurvived`; **owner authors the impostor weighting** |
| Website — `processMatch.ts` | pass `roundsSurvived` into `computePerf` |
| Tests | brain xUnit (ejected-at-meeting-2 → 1; never-ejected → all meetings); website vitest (perf, processMatch, schema default) |

The Prisma column's `@default(0)` (with the zod field `.optional()`, consumers `?? 0`) keeps this additive — existing
seed data, the 59 brain tests, and already-sent matches all still validate (scoring 0).

**`computePerf` — owner contribution (learning mode).** The impostor weighting is a real
design call (per-round value, cap, trade against kills). The plumbing delivers
`roundsSurvived` into `PerfStats`; the owner authors the ~8-line impostor branch, e.g.:

```ts
// IMPOSTOR — owner tunes:
const killScore = s.kills * 0.25;
const hiding    = Math.min(s.roundsSurvived, /*cap*/ 4) * /*per-round*/ 0.06;
const survival  = s.survived ? 0.1 : -0.1;
return clamp(killScore + hiding + survival /* + speed */);
```

Wins already dominate via the `K=32` core (`core = K·(won − expected)`); perf (`B=10`,
clamped ±1) is skill nuance.

## 11. Richer feedback

- **time-to-kill / time-to-task:** brain computes from the `atMs` already on `PlayerKilled`
  (first kill) and `TaskCompleted` → fills `timeToKillMs`/`timeToTaskMs`, which the ingest
  schema and `perf.ts` speed terms already expect (currently always 0). No new hook.
- **ELO deltas in chat:** `/api/ingest/match` returns per-player `eloDelta` (already computed
  and stored in `MatchParticipant.eloDelta`). The mod announces them in the **post-game lobby
  chat** (`Name +18 / Name −12`).

## 12. Identity & linking model

- **Canonical ranked identity = registered friend code.** Players register on `/link`
  (`setFriendCode`); the host mod reads lobby friend codes and resolves them via
  `/api/lobby/roster`, which returns the **opaque `playerId`** (never the Discord id) and
  auto-captures `puid`.
- The match payload keys on `playerId` (matches `participantSchema.playerId`).
- **Friend code format:** `^[a-z]+#\d{3,6}$`, normalized to lowercase (`normalizeFriendCode`).
- The brain's existing chat-code `LinkManager` is retained as optional legacy; the gate and
  match attribution use roster resolution.

## 13. Config & one-click installer

- **Config** (BepInEx config file): `WebsiteBaseUrl` (default prod URL), `HostKey` (empty
  default — host pastes once), `RankedEnabled` (default `true`; also a toggle hotkey),
  `RankedPreset` (the locked settings, or a named preset), `TimerMinutes` (default 18).
  Empty key or `RankedEnabled=false` → HUD `OFF`, mod dormant (no poll/gate/timer/send).
- **`installer/install.ps1`** (double-click `.bat` wrapper):
  1. Auto-detect Among Us via Steam `libraryfolders.vdf` (verified to work here); fallback prompt.
  2. Download **pinned** BepInEx 6 IL2CPP **win-x86** + Reactor releases.
  3. Extract BepInEx into the game folder; copy `GameWatcher.Plugin.dll` + `GameWatcher.Core.dll` → `BepInEx/plugins/`.
  4. Prompt for host key + base URL → write the config file.
  5. Instruct: launch Among Us once (BepInEx generates interop), then look for the RANKED label.
  - **Reversible:** uninstall = delete `BepInEx/` + `winhttp.dll`; the vanilla game is otherwise untouched.

## 14. Error handling & edge cases

- Every Harmony patch + the background worker + the timer controller are wrapped
  `try/catch → BepInEx log + swallow`: a mod bug must never crash the host's game.
- Missing/invalid host key → HUD `OFF`; no poll, gate, send, or timer.
- Network failure → the brain's existing `Sender` queue + retry; idempotent by `matchCode`.
- Whole-role unlinked at game end → brain refuses to send → HUD warns `⚠ not everyone linked`.
  (The pre-start gate makes this rare, but the brain guard stays as a backstop.)
- Site unreachable mid-game → status snapshotted at start (`Unknown` records optimistically);
  the send queues until the site returns.
- Among Us update breaks the Reader → rebuild the Plugin (bump `AmongUs.GameLibs.Steam`); the
  brain, its 59 tests, and the new Core logic are unaffected.

## 15. Testing & verification

- **Compile-verify:** `dotnet build` the plugin (x86, against `AmongUs.GameLibs.Steam`) → green.
- **F9 debug injector (solo live E2E):** a scripted full fake game — including a multi-meeting
  impostor-survival case and a timer-expiry case — pumped through the *real* plugin → brain →
  live HTTP → leaderboard. Proves the entire pipeline without 4 humans.
- **Lobby smoke (solo):** HUD status from the poll; the pre-start gate blocks an unlinked/
  off-preset lobby; friend-code roster resolves; link-code chat logs.
- **Full E2E (≥4 players):** a real ranked game → match on the leaderboard with correct stats
  (incl. `roundsSurvived`, time-to-*), the timer behaving, ELO deltas announced.
- **Unit:** brain xUnit (existing 59 + `roundsSurvived` + `RankedTimer` + time-to-* tests);
  website vitest (perf, processMatch, schema default, ingest eloDelta response).
- No xUnit for Il2Cpp patches (untestable off-game); the debug injector is the plugin-layer check.

## 16. Website changes summary

1. `src/lib/ingest/schema.ts` — add `roundsSurvived` as `.optional()` (consumers `?? 0`; DB column `@default(0)`).
2. `prisma/schema.prisma` + migration — `MatchParticipant.roundsSurvived Int @default(0)`.
3. `src/lib/elo/perf.ts` — `PerfStats.roundsSurvived`; owner-authored impostor weighting; wire time-to-* (already present).
4. `src/lib/ingest/processMatch.ts` — pass `roundsSurvived` into `computePerf`; ensure `eloDelta` is returned.
5. `/api/ingest/match` route — include per-player `eloDelta` in the response.
6. vitest updates for the above.

(No change needed to `/api/lobby/roster`, `/api/host/status`, `/api/link`, or `setFriendCode` —
they already provide what the mod needs.)

## 17. Core (brain) changes summary — all additive

1. `Wire.Participant` + `GameWatcherJson` — `RoundsSurvived`.
2. `MatchRecorder` — derive `roundsSurvived` and `timeToKillMs`/`timeToTaskMs`.
3. New `RankedTimer` (pure, tested).
4. New roster-resolution path feeding the link map (consume `/api/lobby/roster`’s `matched`).
5. xUnit tests for all of the above. Re-run the full suite (target: 59 + new, all green).

## 18. Build order (phasing for the implementation plan)

1. **Brain additions + website stat** (here, fully tested): `roundsSurvived`, time-to-*,
   `RankedTimer`, roster resolution; ingest schema + Prisma migration + `perf.ts` +
   `processMatch.ts` + `eloDelta` response. Green xUnit + vitest.
2. **Plugin skeleton** (per approach A fallback): BepInEx + Reactor loads on this build; HUD
   label renders; status poll works. Proves the pipeline on buildid `23244517`.
3. **Reader hooks**: the 7 events → `BrainHost` → brain → leaderboard, verified via the F9
   debug injector.
4. **Ranked rules**: pre-start gate (roster + settings) and the 18-min timer + chat
   announcements + force-end.
5. **Installer** + ELO-delta chat + final polish.
6. **Live E2E** on the host PC (solo smoke throughout; ≥4-player real game when available).

## 19. Open questions (carry into planning)

1. Exact `AmongUs.GameLibs.Steam` package version matching buildid `23244517` — resolve at
   build (research pass).
2. The precise ranked **settings preset** values (impostor count, task counts, kill cooldown,
   map allow-list, min players) — owner to specify; the gate compares against them.
3. The impostor-win `GameOverReason` flavor used for the forced end (cosmetic end screen).

## 20. Decisions log

- **Approach A** — Reactor-based thin reader + background pump + F9 debug injector.
- **x86 / net6.0 plugin**, `AmongUs.GameLibs.Steam` compile-time refs, ProjectReference → Core.
- **No new hook for `roundsSurvived`** — derived in the brain from existing events.
- **`roundsSurvived` is a count** (not a boolean), additive end-to-end. The **ingest zod field is `.optional()`** (consumers `?? 0`, DB column `@default(0)`) rather than `.default(0)` — behaviorally identical for present values, and it avoids forcing the field into every existing typed payload literal. (Reconciled from the original `.default(0)` so doc and code agree.)
- **18-min timer pauses in meetings; expiry → IMP_WIN if tasks incomplete.**
- **Timer math lives in Core (pure, tested)** because it decides who wins.
- **Hard all-linked gate via `/api/lobby/roster`**; ranked requires friend-code registration;
  chat-code flow is optional legacy.
- **Settings lock + min players** enforced at start by the lobby gate.
- **Richer feedback**: time-to-kill/task (fills dormant perf terms) + ELO deltas in chat.
- **Excluded this round**: host match controls, disconnect policy, sabotage stats, in-lobby rank display.
- **Ranked activation is local** (`RankedEnabled` + valid key + not `Disabled`), replacing the removed server arm/disarm; dormant otherwise so casual play still works.
- **`computePerf` impostor weighting is the owner's contribution** (learning mode).
