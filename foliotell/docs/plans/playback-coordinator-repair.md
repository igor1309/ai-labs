---
date: 2026-07-10
model: gpt-5
description: "Implementation plan: replace FolioTell's queued playback wiring with one main-actor coordinator and integration-first regression coverage."
---

# Playback Coordinator Repair

## Goal

Replace the released queued transport/position wiring with one main-actor
playback coordinator. The coordinator owns AVFoundation transport truth and
publishes the only live playback state consumed by the reader.

## Execution mode

Mode: auto-continue

Human review between tasks: no

Stop conditions: failed gates, an uncovered ownership decision, unavailable device/TestFlight feedback, destructive operations, explicit user interruption

Push policy: no push

## Execution lock

Worktree mode: create new

Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/codex-foliotell-playback-coordinator

Expected branch: codex/foliotell-playback-coordinator

Preflight check: [x] `git worktree list --porcelain` and `git branch --show-current` verified this worktree and branch on 2026-07-10.

## Scope guardrails

- Replace only live playback ownership, scheduling, voice readiness, and position propagation.
- Retain FolioTell's Reader Settings and control layout.
- Do not ship a fallback through `AVSpeechSynthesisVoice(language:)`.
- Exclude new playback features, UI redesign, background/remote controls, and release work.

## Phase 1 — Integration contract before replacement

**Objective:** establish tests that fail against the released queue graph.

**Key work items:**

- Add composed coordinator–synthesizer-spy tests for direct Play, early Pause, Stop, word progress, catalog readiness, and teardown.
- Add a controllable callback harness proving UI actions require no scheduler advance.

**Validation:** new tests compile and fail with behavioral assertions on `0.6.1` wiring.

**Completion signal:** tests identify the released queue hop, early-pause, and catalog-race failures.

## Phase 2 — Single-owner coordinator

**Objective:** make one `@MainActor` coordinator own synthesizer, transport, request snapshot, pause intent, spoken offset, and teardown.

**Key work items:**

- Remove queued `RxViewModel` use from live playback and remove the relay/binder graph.
- Route AVFoundation delegate facts directly to the coordinator's main-actor entry point.
- Derive persisted anchors from coordinator word facts without a second live state machine.

**Validation:** integration tests prove ordered collaborator calls and deallocation.

**Completion signal:** Play reaches `activateAudioSession` then `speak` before the initiating method returns; no playback relay remains.

## Phase 3 — Explicit readiness and pause intent

**Objective:** prevent voice readiness races and make Pause during startup deterministic.

**Key work items:**

- Resolve catalog-backed Auto voice before speaking or expose an explicit preparing state.
- Freeze the active request's voice/settings at Play.
- Apply a pending pause at `didStart`, before a spoken-word callback.

**Validation:** integration tests prove catalog completion cannot restart speech and early Pause settles before any word progress.

**Completion signal:** no play path calls `AVSpeechSynthesisVoice(language:)`; no secondary catalog event mutates active playback.

## Phase 4 — Bounded observation and device evidence

**Objective:** publish only the minimal word-progress projection and measure the full device flow.

**Key work items:**

- Isolate immutable document/menu presentation from live progress.
- Add signposts for tap, speak, didStart, pause request/accept, and stop.
- Verify TestFlight playback latency and no orphan audio on the user's device.

**Validation:** full Swift tests/build/archive plus recorded device timings.

**Completion signal:** Play, Pause, and Stop each reach their audible outcome in under one second.

## Done criteria

1. One main-actor coordinator is the only owner of live playback truth.
2. Main-actor UI actions reach the synthesizer without `DispatchQueue.main.async`.
3. Integration tests fail if Play/Pause/Stop or word progress crosses an extra state machine or scheduler.
4. Voice readiness cannot alter an active request and no language-voice fallback remains.
5. `swift test`, `swift build`, and unsigned iOS archive pass.
6. TestFlight device measurements show Play, Pause, and Stop under one second with no orphan audio.

## Verification evidence

1. PASS — `ReaderSession` is the only observed live playback owner in the
   reader App layer; `rg` finds no live transport/position model wiring or
   `PlaybackTransportEventRelay`.
2. PASS — `test_primaryTapped_shouldReachSynthesizerInSameMainActorTurn`
   proves a Play tap synchronously invokes audio-session activation then
   `speak`; `rg` finds no `DispatchQueue.main.async` in FolioTell sources.
3. PASS — composed tests cover Play, startup Pause before any word callback,
   Stop/restart stale completion, position persistence, and exactly one
   published playback snapshot for each word callback.
4. PASS — the adapter contains no `AVSpeechSynthesisVoice(language:)` call or
   process-global voice catalog; the UI resolves the catalog selection before
   a request snapshot and ignores the catalog-load selection transition.
5. PASS — `swift test` passed 193 tests and the unsigned iOS archive completed
   with `ARCHIVE SUCCEEDED` on 2026-07-10.
6. FAIL — no new TestFlight device measurements exist yet. This is the
   outstanding acceptance criterion; it cannot be replaced by a simulator or
   unit test.

## Final closeout

Final gates: integration tests, full Swift verification, archive, device evidence, diff/log review.

Archive plan: move to `foliotell/docs/plans/implemented/`.

Commit archive move: yes.

Push/PR: follow no-push policy.
