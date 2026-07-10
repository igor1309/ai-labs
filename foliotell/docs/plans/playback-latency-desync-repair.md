---
date: 2026-07-10
model: gpt-5
description: "Implementation plan: repair FolioTell playback latency, transport desynchronization, and session-lifecycle regressions."
---

# Playback Latency and Transport Desynchronization Repair

## Goal

Restore responsive, synchronized FolioTell playback after the 0.4.x playback
refactor and 0.6.0 controls split. Preserve ADR-002's two-machine architecture
while keeping word-level rendering bounded and session ownership releasable.

## Execution mode

Mode: auto-continue

Human review between tasks: no

Stop conditions: failed gates, unclear scope, missing device tooling, destructive operations, explicit user interruption

Push policy: no push

## Execution lock

Worktree mode: create new

Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/codex-playback-latency-desync

Expected branch: codex/playback-latency-desync

Preflight check: [x] `git worktree list --porcelain` and `git branch --show-current` verified this worktree and branch on 2026-07-10.

## Scope guardrails

- Retain the 0.6.0 Reader Settings, Voice menu, and compact Playback menu layout.
- Repair only the reader playback path, session lifecycle, AVFoundation adapter, and tests needed to prevent recurrence.
- Preserve stored settings keys, document loading, playback-position persistence semantics, and ADR-002's Core/App boundary.
- Exclude neural voices, downloads, network services, lock-screen/remote transport, background-audio expansion, release tagging, push, and deployment.

## ADR traceability matrix

| ADR-002 invariant | Phase |
| --- | --- |
| Per-spoken-word work remains bounded | 1 |
| Composition root owns concrete assembly and collaborator wiring | 2 |
| Effect collaborators are injected and spy-testable | 2, 4 |
| Reducers own explicit and stale-event-safe transport transitions | 3 |
| All observation flows through the serialized event funnel | 3 |

## Phase 1 — Restore bounded reader rendering

**Objective:** prevent word-progress updates from rebuilding menus or repeating document-wide derivations.

**Key work items:**

- Add a failing regression test for menu input stability and a testable presentation projection that is independent of word progress.
- Restore Equatable menu subviews using menu-specific input state; retain the current toolbar layout.
- Cache renderable document text and language-derived voice filtering outside the word-progress render path.

**Dependencies:** none.

**Risks:** over-isolating the Start Over enablement or selected voice/speed could leave a menu stale after a real settings change.

**Validation:** focused App tests, `swift test`, and a device UI check with an open menu during sustained playback.

**Completion signal:** progress updates modify only progress/transport presentation; menu inputs and document-derived presentation are not recomputed per spoken word.

## Phase 2 — Repair composition ownership and teardown

**Objective:** ensure closing a reader releases its transport and synthesizer stack and stops active speech.

**Key work items:**

- Add a failing lifecycle/deallocation test for a composed `ReaderSession`.
- Replace the adapter-to-transport strong capture with a weak event relay owned by the composition wiring.
- Make reader-session shutdown explicitly stop synthesis and deactivate audio before releasing the session.

**Dependencies:** Phase 1.

**Risks:** an event delivered during initial assembly or after teardown must be safely ignored without violating token semantics.

**Validation:** focused composition tests, `swift test`, and Xcode Memory Graph after repeated open/close cycles.

**Completion signal:** weak session, transport, adapter, and handler references become `nil` after release; closing a speaking document cannot leave audible speech behind.

## Phase 3 — Make early play/pause/stop transitions explicit

**Objective:** remove the startup window where a requested pause is silently rejected and UI state trails the audible engine.

**Key work items:**

- Add queued-scheduler transport tests for play followed immediately by pause or stop, plus stale terminal callbacks.
- Extend the transport domain with explicit starting, pause-pending, and stopping behavior driven by AVFoundation start/terminal callbacks.
- Route adapter start callbacks through token-scoped events; retry a pending pause only at a valid speech boundary and surface a deterministic state until it resolves.

**Dependencies:** Phase 2.

**Risks:** replacement, jump, speed, and voice-change paths must preserve monotonic token handling and paused offsets.

**Validation:** focused reducer/effect-handler/runtime tests, `swift test`, and device tap sequences during cold and warm starts.

**Completion signal:** every primary-control tap maps to one visible pending or settled state, and an early pause/stop cannot be dropped or revive a stopped utterance.

## Phase 4 — Remove voice-catalog work from playback startup

**Objective:** guarantee the speech tap path never queries `speechVoices()` synchronously and catalog arrival cannot mutate active playback.

**Key work items:**

- Add a catalog-provider seam with a spy that proves `speak` does not perform discovery.
- Load/cache the catalog off the main actor and share it between picker presentation and Auto voice resolution.
- Separate catalog availability from user intent so arrival updates choices only; it neither restarts nor resumes an active utterance.

**Dependencies:** Phase 1 and Phase 3.

**Risks:** Auto voice must retain the audio-capable, highest-quality selection rule and still provide a valid default while the catalog is loading.

**Validation:** focused adapter/App tests, `swift test`, and cold-device play/pause measurements with Auto and an explicit voice.

**Completion signal:** the adapter has no direct catalog enumeration on its `speak` path, and catalog completion leaves the active token and playback state unchanged.

## Done criteria

1. Progress callbacks do not rebuild bottom-menu content or execute document-wide rendering/language/voice filtering, proven by focused tests and a device profile.
2. Releasing a closed reader deallocates its playback stack and stops active speech, proven by lifecycle tests and Memory Graph verification.
3. Play, immediate pause, immediate stop, and late AVFoundation callbacks have explicit token-safe reducer behavior covered by queued-scheduler tests.
4. Auto voice startup never synchronously enumerates voices and catalog arrival never restarts/resumes playback, covered by collaborator-spy tests.
5. `swift test`, `swift build`, and the unsigned iOS archive command pass.
6. Device checks record responsive play/pause/stop on a book-length document and no orphaned audio after repeated close/reopen cycles.

## Final closeout

Final gates: focused tests per phase; `swift test`; `swift build`; unsigned iOS archive; device latency/menu/lifecycle checks; diff and log review.

Archive plan: move to `foliotell/docs/plans/implemented/`.

Commit archive move: yes.

Push/PR: follow no-push policy; do not push or open a pull request without user instruction.
