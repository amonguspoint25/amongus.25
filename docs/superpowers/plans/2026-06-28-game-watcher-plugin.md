# GameWatcher.Plugin (Plan B) Implementation Plan

> **For agentic workers:** This plan is executed **live on the host PC** (the machine with Among Us). Unlike Plan A, the deliverables are validated by **building and running the game**, not by unit tests — Harmony patches over IL2CPP cannot be xUnit-tested. Steps use checkbox (`- [ ]`) syntax. Execute phases in order; each ends in a concrete in-game (or build) verification. Do NOT use subagent-driven TDD for the game-coupled tasks — they need a human at the machine watching the game and the BepInEx log.

**Goal:** Ship the host-only BepInEx + Reactor mod that reads real Among Us games, feeds the already-built `GameWatcher.Core` brain, enforces the ranked ruleset (pre-start gate + 18-min task deadline), and installs in one click.

**Architecture:** A thin **Game Reader** (Harmony patches that build plain `GameEvent` records on the Unity main thread) → a **BrainHost** composition root (builds the Core chain, runs a background worker that `await`s `MatchSession.HandleAsync`, polls status, holds volatile UI state) → the Core brain does all logic. Plus a **RANKED HUD**, a **pre-start gate**, a **RankedTimerController**, a **debug injector**, and a **one-click installer**.

**Tech Stack:** C# `net6.0` x86, BepInEx 6 (IL2CPP), Reactor, Il2CppInterop, `AmongUs.GameLibs.Steam` (compile-time stubs), `ProjectReference` → `GameWatcher.Core` (netstandard2.1). PowerShell installer.

## Global Constraints

- **Target: `net6.0`, `<PlatformTarget>x86</PlatformTarget>`** — Among Us is 32-bit (confirmed: `Among Us.exe` PE machine = x86, Unity 2022.3.44f1, IL2CPP, Steam buildid `23244517`).
- **`AmongUs.GameLibs.Steam` version must match this build** (`23244517`) — the one build-time lookup. BepInEx `BepInEx.Unity.IL2CPP` 6.x and a `Reactor` version compatible with it.
- **Game path:** `C:\Program Files (x86)\Steam\steamapps\common\Among Us` (auto-detected via Steam `libraryfolders.vdf`). No BepInEx installed yet.
- **Host-only, host-authoritative.** Only the host runs the mod; the host client is ground truth for roles/kills/votes/tasks/friend codes/settings.
- **Never crash the game.** Every Harmony patch and the background worker/timer/gate loops are wrapped `try/catch → BepInEx log + swallow`.
- **`inGameId` is always `PlayerControl.PlayerId.ToString(InvariantCulture)`** — for BOTH event records and roster rows, so `LinkManager`'s cached keys line up (Plan A note).
- **Threading rule:** read Il2Cpp objects into plain records ON the Unity main thread before enqueueing; the background worker only touches plain records + HTTP. Never touch a game object off-thread (it crashes AU). UI mutation stays main-thread.
- **`RankedTimer` must be `Reset()` before `Tick()/Resume()`** (Plan A invariant) — the controller `Reset`s at GameStarted.
- **Ranked-active** = `RankedEnabled` (config, default true) AND a non-empty `HostKey` AND `RankedGate != Disabled`. Otherwise the mod is dormant (HUD `OFF`; no gate/timer/recording).
- Branch `feat/game-watcher-plugin` (continues from Plan A). Commit per task; do NOT push. No Claude/AI co-author or attribution line.
- Spec: `docs/superpowers/specs/2026-06-28-game-watcher-plugin-design.md`.

## Core API the plugin consumes (verified, exact)

- `MatchSession(RankedGate, LinkManager, MatchRecorder, MatchBuilder, Sender)` → `Task<SessionOutcome> HandleAsync(GameEvent e, CancellationToken ct = default)`.
- `SessionOutcome { SessionResultKind Kind; string? Warning; SendResult? Send }`, kinds `None/NotRanked/Recording/RecordingUnverified/Refused/Sent`.
- `RankedGate(IHttpTransport)` → `Task<RankedStatus> GetStatusAsync(ct)`; `RankedStatus { Enabled, Disabled, Unknown }`.
- `LinkManager(IHttpTransport)` → `Task<bool> HandleChatAsync(ChatMessage, ct)`, `Task<IReadOnlyList<int>> ResolveRosterAsync(IReadOnlyList<RosterPlayer>, ct)`, `bool TryGetPlayerId(string,out string)`.
- `MatchRecorder()`, `MatchBuilder()`.
- `Sender(IHttpTransport, IMatchQueue)` → `SendAsync(MatchPayload,ct)`, `DrainAsync(ct)`. Queue: `FileMatchQueue` / `InMemoryMatchQueue` (`IMatchQueue`).
- `HttpClientTransport(HttpClient http, string baseUrl, string hostKey) : IHttpTransport`.
- `RankedTimer()` → `Reset(long)`, `Pause()`, `Resume()`, `bool Tick(long)`, `RemainingMs`, `HasExpired`.
- Events (namespace `GameWatcher.Core.Domain`): `GameStarted(string MatchCode, string? Map, DateTimeOffset StartedAt, IReadOnlyList<RosterEntry> Roster)`, `RosterEntry(string InGameId, string Name, Role Role)`, `TasksAssigned(string InGameId, int TaskCount)`, `PlayerKilled(string KillerInGameId, string VictimInGameId, long AtMs)`, `TaskCompleted(string InGameId, long AtMs)`, `MeetingEnded(string? EjectedInGameId, IReadOnlyList<VoteCast> Votes)`, `VoteCast(string VoterInGameId, string? TargetInGameId)`, `ChatMessage(string SenderInGameId, string Text)`, `GameEnded(Outcome Outcome, DateTimeOffset EndedAt)`. Enums `Role{CREW,IMPOSTOR}`, `Outcome{CREW_WIN,IMP_WIN}`.
- `RosterPlayer(int InGameId, string FriendCode, string? Puid = null, string? InGameName = null)` (namespace `GameWatcher.Core`).

---

## Phase 0 — Toolchain bootstrap & interop (milestone: the plugin LOADS)

### Task 1: Resolve toolchain versions + plugin project skeleton

**Files:** Create `game-watcher/src/GameWatcher.Plugin/GameWatcher.Plugin.csproj`, `game-watcher/src/GameWatcher.Plugin/GameWatcherPlugin.cs`; Modify `game-watcher/GameWatcher.slnx`.

**Research (do first, record findings in the commit message body):**
- Find the `AmongUs.GameLibs.Steam` NuGet version that matches Steam buildid `23244517` (browse the package versions; pick the one for this build, or the newest ≤ it). Record the chosen version.
- Pick `BepInEx.Unity.IL2CPP` 6.x (bleeding/CI build per BepInEx docs for IL2CPP) and a compatible `Reactor` version. Record both.

- [ ] **Step 1:** Write `GameWatcher.Plugin.csproj`: `<TargetFramework>net6.0</TargetFramework>`, `<PlatformTarget>x86</PlatformTarget>`, `<AllowUnsafeBlocks>true</AllowUnsafeBlocks>`, `<LangVersion>latest</LangVersion>`; `BepInEx.PluginInfoProps`; PackageReferences for the resolved `BepInEx.Unity.IL2CPP`, `Reactor`, `AmongUs.GameLibs.Steam` versions; `<ProjectReference Include="..\GameWatcher.Core\GameWatcher.Core.csproj" />`. Disable warnings-as-errors here (interop stubs warn) unless clean.
- [ ] **Step 2:** Write a minimal `GameWatcherPlugin.cs`:
  - `[BepInAutoPlugin]` or explicit `[BepInPlugin(Id, Name, Version)]` on a `public sealed class GameWatcherPlugin : BasePlugin`; `[BepInProcess("Among Us.exe")]`; `[BepInDependency(ReactorPlugin.Id)]`.
  - `public override void Load()` → `Log.LogInfo("GameWatcher ranked mod loaded vX");` and register a Harmony instance (`var harmony = new Harmony(Id); harmony.PatchAll();`) — no patches yet.
- [ ] **Step 3:** Add the project to `GameWatcher.slnx`.
- [ ] **Step 4 (verify build):** `dotnet build game-watcher/src/GameWatcher.Plugin` → succeeds (NuGet restores interop stubs). Expected: build OK. If `AmongUs.GameLibs.Steam` version doesn't resolve, try the adjacent version and record which built.
- [ ] **Step 5: Commit** `feat(plugin): scaffold GameWatcher.Plugin (BepInEx IL2CPP x86 + Reactor)` with the resolved versions in the body.

### Task 2: Install BepInEx + Reactor into the game; confirm the plugin loads

**Files:** none in-repo (this provisions the game folder + verifies loading). Manual/interactive.

- [ ] **Step 1:** Download the **BepInEx 6 IL2CPP win-x86** release + the matching **Reactor** release (record URLs/versions). Extract BepInEx into `C:\Program Files (x86)\Steam\steamapps\common\Among Us`.
- [ ] **Step 2:** Launch Among Us once and quit. BepInEx generates `BepInEx/interop/*.dll` (Il2Cpp-Assembly-CSharp etc.). Confirm `BepInEx/LogOutput.log` shows BepInEx initialized and interop generated. **This interop is the source of truth for the reader's exact type/method/field names in Phase 3.**
- [ ] **Step 3:** Build the plugin (Task 1) and copy `GameWatcher.Plugin.dll` + `GameWatcher.Core.dll` → `Among Us/BepInEx/plugins/`. Also drop the Reactor plugin DLL in `plugins/` if not auto-installed.
- [ ] **Step 4 (verify load):** Launch Among Us. In `BepInEx/LogOutput.log`, confirm `GameWatcher ranked mod loaded vX` and that Reactor loaded with no exceptions. **Milestone: the plugin loads on this exact build.**
- [ ] **Step 5:** Record in the commit message body (no game files are committed) the BepInEx + Reactor versions and that load succeeded; commit any csproj/version tweaks needed to load: `chore(plugin): pin BepInEx/Reactor versions confirmed loading on build 23244517`.

---

## Phase 1 — Composition, config, status, HUD (milestone: HUD shows correct ranked status in a lobby)

### Task 3: PluginConfig

**Files:** Create `game-watcher/src/GameWatcher.Plugin/Config/PluginConfig.cs`.

**Produces:** `PluginConfig` exposing `string WebsiteBaseUrl`, `string HostKey`, `bool RankedEnabled`, `int TimerMinutes`, and the ranked-preset values (impostor count, task counts, kill cooldown, map allow-list, min players — model as a small `RankedPreset` record).

- [ ] **Step 1:** In `Load()`, bind BepInEx config entries under section `[GameWatcher]`: `WebsiteBaseUrl` (default the prod URL), `HostKey` (default ""), `RankedEnabled` (default true), `TimerMinutes` (default 18), plus `[RankedPreset]` entries. Expose them via `PluginConfig`.
- [ ] **Step 2 (verify):** Launch; confirm `BepInEx/config/<id>.cfg` is written with the keys + defaults; edit `HostKey`, relaunch, confirm it's read (log it at startup, masked).
- [ ] **Step 3: Commit** `feat(plugin): BepInEx config (base url, host key, ranked toggle, timer, preset)`.

### Task 4: BrainHost composition root

**Files:** Create `game-watcher/src/GameWatcher.Plugin/Composition/BrainHost.cs`.

**Produces:** `BrainHost` that:
- builds, from `PluginConfig`: `var http = new HttpClient(); var transport = new HttpClientTransport(http, cfg.WebsiteBaseUrl, cfg.HostKey);` → `new RankedGate(transport)`, `new LinkManager(transport)`, `new MatchRecorder()`, `new MatchBuilder()`, `new Sender(transport, new FileMatchQueue(<plugins-data-path>/queue.json))` → `new MatchSession(gate, link, recorder, builder, sender)`. (Confirm `FileMatchQueue` ctor arg by reading `game-watcher/src/GameWatcher.Core/Queue/FileMatchQueue.cs`.)
- exposes `void Enqueue(GameEvent e)` (thread-safe `ConcurrentQueue<GameEvent>` + a signal), a background `Task` worker loop that dequeues and `await session.HandleAsync(e)` (try/catch per event), updating a `volatile` UI snapshot from the `SessionOutcome` (recording? unverified? refused warning?).
- exposes the `LinkManager`, `RankedGate`, `RankedTimer`, and the volatile snapshot for the gate/HUD/controller.
- runs a **status poll loop** (`Task`, ~5s): `await gate.GetStatusAsync()` → update the snapshot's `RankedStatus`; also periodically `await sender.DrainAsync()` to flush the queue.
- honors **ranked-active**: when not active (RankedEnabled off / no key / Disabled), the worker drops recording events (still updates status) so the mod is dormant.

- [ ] **Step 1:** Implement `BrainHost` per the above (concrete C#; reference the exact Core ctors listed in "Core API"). Start the worker + poll loops in `Load()` after building.
- [ ] **Step 2 (verify):** Launch; confirm (BepInEx log) the status poll runs and logs `Enabled/Disabled/Unknown` matching whether the configured `HostKey` is valid against the live site. With an empty key → dormant/`Disabled`.
- [ ] **Step 3: Commit** `feat(plugin): BrainHost composition, event queue, background worker, status poll`.

### Task 5: RANKED HUD label

**Files:** Create `game-watcher/src/GameWatcher.Plugin/Ui/RankedHud.cs`.

**Produces:** a corner `TextMeshPro` (or `GameObject` text) added under `HudManager`, refreshed each `HudManager.Update` from `BrainHost`'s volatile snapshot, showing the §7 states: `RANKED: OFF — no key` / `RANKED: OFF` / `RANKED: ? (offline)` / `RANKED: ON` / `● REC` / `● REC (unverified)` / flash `⚠ not everyone linked`. (Timer countdown text is added in Task 11.)

- [ ] **Step 1:** Harmony-patch `HudManager.Start` (create/attach the text element) and `HudManager.Update` (set text from the snapshot). Confirm the exact `HudManager` member names against the generated interop. Keep all UI work main-thread.
- [ ] **Step 2 (verify):** Launch into a lobby with a valid key → `RANKED: ON`; clear the key → `RANKED: OFF`; block the site / bad key → the right state. Confirm no game crash.
- [ ] **Step 3: Commit** `feat(plugin): on-screen RANKED status label`.

---

## Phase 2 — Debug injector (milestone: a scripted game lands on the leaderboard, solo)

### Task 6: DebugInjector

**Files:** Create `game-watcher/src/GameWatcher.Plugin/Debug/DebugInjector.cs`.

**Produces:** an `Update`-loop key check (e.g. F9 via `Input`/`UnityEngine`) that, when pressed, enqueues a **scripted full fake game** through `BrainHost.Enqueue(...)`: a `GameStarted` with a small roster (≥1 IMPOSTOR + ≥1 CREW, using `inGameId`s that resolve to linked test accounts — or rely on a roster pre-seeded link map), `TasksAssigned`, a couple `TaskCompleted`/`PlayerKilled`, a `MeetingEnded` (so `roundsSurvived` is exercised), and `GameEnded(IMP_WIN)`. Uses a unique `matchCode` per press (`"DEBUG-" + <frame/Time-based suffix>`).

- [ ] **Step 1:** Implement the injector. For linking in the fake game, either inject `ChatMessage`s carrying real link codes, or document that the operator must have test accounts whose `inGameId`s are pre-resolved (simplest: drive a real lobby roster first, then inject). Keep it behind a debug flag so it never fires in a real ranked game.
- [ ] **Step 2 (verify — KEY MILESTONE):** With a valid `HostKey` and at least one linked impostor + one linked crew resolvable, press F9 in-game → confirm a `DEBUG-*` match appears on the live leaderboard with correct stats incl. `roundsSurvived` and ELO deltas applied. **This proves config → reader-seam → brain → HTTP → DB end-to-end without 4 players.**
- [ ] **Step 3: Commit** `feat(plugin): F9 debug injector (scripted game through the live pipeline)`.

---

## Phase 3 — Reader hooks (milestone: a real game records correctly)

> For each patch: it runs on the Unity main thread, reads game state into the named plain record, and calls `BrainHost.Enqueue`. **Confirm each hook's exact class/method/field names against `BepInEx/interop` (Phase 0) before writing the body** — the targets below are the canonical AU hook points; signatures shift across versions. Wrap every patch `try/catch → Log + swallow`. Verify by reading `BepInEx/LogOutput.log` during a real (or freeplay/with-friends) game and by the match landing on the leaderboard.

### Task 7: Game lifecycle patches (GameStarted, GameEnded, TasksAssigned)

**Files:** Create `Reader/PlayerRef.cs`, `Reader/GameLifecyclePatches.cs`.

- `PlayerRef`: helpers to map a `PlayerControl`/`NetworkedPlayerInfo` → `inGameId = PlayerId.ToString(invariant)`, `name`, `Role` (CREW/IMPOSTOR from the player's role/`Data`), and (for the gate) `FriendCode`/`Puid` from `ClientData`. Confirm members vs interop.
- **GameStarted** — hook the end of `IntroCutscene` (roles revealed; e.g. `IntroCutscene.OnDestroy` or `BeginCrewmate`/`BeginImpostor` completion). Build `matchCode = "{GameCode}-{epochSec}"` (game code via `AmongUsClient.Instance.GameId` → `GameCode.IntToGameName`), `map` from game options, `startedAt = DateTimeOffset.UtcNow`, roster from all players. Record game start time for `atMs`.
- **TasksAssigned** — at the same point, per crew player emit `TasksAssigned(inGameId, Data.Tasks.Count)`; impostors → 0.
- **GameEnded** — hook `AmongUsClient.OnGameEnd` / `EndGameResult`; map `GameOverReason` → `CREW_WIN`/`IMP_WIN`; emit `GameEnded(outcome, DateTimeOffset.UtcNow)`.

- [ ] Implement; confirm signatures vs interop; **verify:** start a game (freeplay/friends), log shows `GameStarted` with the full roster+roles and `TasksAssigned`; end it, log shows `GameEnded` with the right outcome.
- [ ] **Commit** `feat(plugin): reader — game lifecycle (start roster/tasks, end outcome)`.

### Task 8: Kill & task patches (PlayerKilled, TaskCompleted)

**Files:** Create `Reader/KillPatches.cs`, `Reader/TaskPatches.cs`.

- **PlayerKilled** — hook `PlayerControl.MurderPlayer` (postfix); emit `PlayerKilled(killer.PlayerId, victim.PlayerId, atMs = now-startedAt)`.
- **TaskCompleted** — hook the task-complete RPC/path (e.g. `PlayerControl.CompleteTask` / `GameData.CompleteTask`); emit `TaskCompleted(inGameId, atMs)`.

- [ ] Implement; confirm signatures; **verify:** in a game, a kill and a task-complete each log the right record.
- [ ] **Commit** `feat(plugin): reader — kills and task completions`.

### Task 9: Meeting & chat patches (MeetingEnded, ChatMessage)

**Files:** Create `Reader/MeetingPatches.cs`, `Reader/ChatPatches.cs`.

- **MeetingEnded** — hook `MeetingHud.VotingComplete(states, exiled, tie)`; emit `MeetingEnded(exiled?.PlayerId, votes)` where each `state.VoterId → state.VotedFor` (skip/255 → null `TargetInGameId`). Also expose meeting **open/close** signals (e.g. `MeetingHud.Start` / `MeetingHud.Close` or `OnDestroy`) for the timer (Task 11).
- **ChatMessage** — hook `ChatController.AddChat(sourcePlayer, text)`; emit `ChatMessage(sourcePlayer.PlayerId, text)` (host sees all chat → link codes flow to `LinkManager`).

- [ ] Implement; confirm signatures; **verify:** a meeting with votes logs `MeetingEnded` with correct voter→target and ejected; typing a valid link code in lobby chat resolves a link (log). A full real game now records to the leaderboard with correct stats.
- [ ] **Commit** `feat(plugin): reader — meetings (votes/eject) and chat (link codes)`.

---

## Phase 4 — Ranked rules (milestone: gate blocks bad lobbies; timer forces imp win)

### Task 10: Pre-start gate (LobbyGate)

**Files:** Create `Reader/LobbyGate.cs` (or `Ranked/LobbyGate.cs`).

**Produces:** a lobby validation loop + a `GameStartManager.BeginGame` prefix.
- Loop (every few seconds while in the lobby, only when ranked-active): read all lobby players' `RosterPlayer(PlayerId, FriendCode, Puid, Name)` via `PlayerRef` → `await brainHost.Links.ResolveRosterAsync(players)`; if the returned unmatched list is non-empty → cached verdict `BLOCKED("not linked: <names>")`. Read `GameOptions` → compare to `cfg.RankedPreset` + min players → `BLOCKED("settings off-preset: <detail>")` if off. Else `READY`. Push the verdict to the HUD snapshot.
- `GameStartManager.BeginGame` **prefix**: if ranked-active and the cached verdict isn't READY, return `false` (cancel start) and flash the reason on the HUD. (Patch reads the cached bool only — no HTTP on the frame.)

- [ ] Implement; confirm `GameStartManager.BeginGame` + `GameOptions`/`ClientData.FriendCode` members vs interop. **verify:** an unlinked or off-preset lobby cannot start ranked (start button blocked + reason shown); a fully-linked on-preset lobby starts and the link map is pre-seeded from `matched`.
- [ ] **Commit** `feat(plugin): pre-start gate (all-linked roster + settings lock)`.

### Task 11: RankedTimerController (18-min deadline + force imp win + chat + countdown)

**Files:** Create `Ranked/RankedTimerController.cs`; Modify `Ui/RankedHud.cs` (add countdown text).

**Produces:** drives the Core `RankedTimer`:
- On `GameStarted` (ranked-active) → `timer.Reset(cfg.TimerMinutes*60_000)`.
- Each frame outside a meeting → `if (timer.Tick((long)(Time.deltaTime*1000)))` → **on the once-true expiry**: read `GameData.Instance` `CompletedTasks`/`TotalTasks`; if `TotalTasks > 0 && CompletedTasks < TotalTasks` → `GameManager.Instance.RpcEndGame(<impostor-win GameOverReason>, false)` (host-authoritative). The forced end flows through the Task 7 `GameEnded` hook → recorded as IMP_WIN.
- Meeting open → `timer.Pause()`; meeting close → `timer.Resume()` (from Task 9 signals).
- Chat announce: at each meeting open, `PlayerControl.LocalPlayer.RpcSendChat("task time remaining: MM:SS")`.
- HUD: show `MM:SS` (or `PAUSED` during a meeting) next to the RANKED label, from `timer.RemainingMs`.

- [ ] Implement; confirm `GameData.CompletedTasks/TotalTasks`, `GameManager.RpcEndGame` signature + the impostor-win `GameOverReason`, and `RpcSendChat` vs interop. **verify (can use shortened `TimerMinutes` for testing):** timer counts down, freezes during meetings, and on expiry with tasks incomplete the game ends as an impostor win + the match records; chat shows the remaining-time announcement at meetings.
- [ ] **Commit** `feat(plugin): ranked 18-min task deadline (timer, force imp win, chat + countdown)`.

---

## Phase 5 — Installer & ELO-delta feedback

### Task 12: One-click installer

**Files:** Create `game-watcher/installer/install.ps1`, `game-watcher/installer/Install-RankedMod.bat`.

- `install.ps1`: detect Among Us via Steam `libraryfolders.vdf` (fallback prompt); download the **pinned** BepInEx IL2CPP x86 + Reactor releases; extract into the game folder; copy `GameWatcher.Plugin.dll` + `GameWatcher.Core.dll` → `BepInEx/plugins/`; prompt for `HostKey` + base URL and write the config; print "launch once, look for the RANKED label". Reversible (uninstall = delete `BepInEx/` + `winhttp.dll`).
- `Install-RankedMod.bat`: `powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"`.

- [ ] Implement the PS1 (concrete). **verify:** on a clean copy (or after deleting BepInEx), run the installer → game folder provisioned, config written, plugin loads.
- [ ] **Commit** `feat(plugin): one-click PowerShell installer`.

### Task 13: Post-game ELO deltas in chat

**Files:** Modify `game-watcher/src/GameWatcher.Core/Sender.cs` (+ `SendResult`) to surface the 200 response body; Modify the plugin worker/announcer to parse + announce.

- Core: have `Sender`'s 200 path carry the response body (the `{matchId, results}` from Plan A) in `SendResult.Detail` (today 200 returns `Detail = null`). Add an xUnit test that a 200 body is surfaced.
- Plugin: on a `Sent` `SessionOutcome` in the post-game lobby, parse `results` (via `GameWatcherJson`) and `RpcSendChat` `"<Name> +18 / <Name> −12"` (map `playerId` → name via the link map / roster).

- [ ] Implement (Core change is xUnit-testable — add the test; plugin part is live-verified). **verify:** after a recorded game (or F9 injector), the lobby chat shows the ELO deltas.
- [ ] **Commit** `feat(elo+plugin): surface ingest ELO deltas and announce them in post-game chat`.

---

## Phase 6 — Live end-to-end

### Task 14: Full E2E + host checklist

**Files:** Create `game-watcher/installer/HOST_CHECKLIST.md`.

- [ ] Run a real **≥4-player** ranked game start to finish on the host PC. Confirm: gate enforced pre-start; correct stats on the leaderboard (roles, kills, correct/incorrect shots, tasks, survived, `roundsSurvived`, time-to-*); timer behavior; ELO deltas announced; queue/retry survives a mid-game site blip.
- [ ] Write `HOST_CHECKLIST.md` (install, paste key, register friend codes, start ranked, troubleshooting).
- [ ] **Commit** `docs(plugin): host checklist; mark Plan B live-verified`.

---

## Notes & sequencing

- **Verification is live, not xUnit** (except the Core `Sender` tweak in Task 13). The F9 injector (Task 6) is the safety net that proves the brain pipeline before the reader hooks exist.
- **Phase 0 must complete before Phase 3** — the generated interop is what makes the reader-patch signatures knowable.
- **Sweep Plan A's deferred minors** here where a live consumer now exists: the `RankedTimer` Reset-before-use invariant is exercised by Task 11; the roster fail-closed path by Task 10. Add the small test gaps (ToMs clamp, schema boundary, perf lower-bound) in a `test(core/web): close Plan A coverage minors` commit alongside this work.
- **Open question to resolve at Task 1/Task 11:** exact `AmongUs.GameLibs.Steam` version and the impostor-win `GameOverReason` flavor (cosmetic).
