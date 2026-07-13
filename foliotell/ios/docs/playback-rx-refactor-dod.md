---
date: 2026-07-08
model: claude-fable-5
description: "Definition of Done for the FolioTell playback architecture refactor: two Rx state machines, composition root, two-role views. North Star document — outcomes and checks, not an implementation plan."
---

# Playback Rx Refactor — Definition of Done

## Purpose

Restructure the FolioTell App layer around explicit, testable state machines so
that transition legality, effect ordering, and persistence policy stop living in
views and delegate bookkeeping. This document is the North Star for the
refactor: it defines the observable end state and how each outcome is checked.
It deliberately does not prescribe the order of work.

## Decided Architecture

These decisions are fixed inputs to the DoD (to be recorded as an ADR, see
criterion 13):

- **Pattern**: IMRX-style state machines — `State` / `Event` / `Effect` types, a
  pure reducer `(State, Event) -> (State, Effect?)`, an effect handler with
  injected collaborators, and a serialized event-processing runtime exposing
  `private(set)` published state with an injected scheduler.
- **Decomposition**: two composed machines, wired at the composition root:
  - **Playback transport** — utterance lifecycle (speak, replace, pause,
    resume, stop, finish, cancel), staleness of synthesizer callbacks, speed
    and voice changes, sentence jumps.
  - **Position** — consumes spoken-offset facts from transport, derives
    document anchors via the existing pure mapping, owns anchor
    record/clear/resume policy and persistence effects.
- **Surviving Core**: `SpeechTextNormalization`, `PlaybackPositionMapping`,
  `SpeechVoiceSelection` remain pure functions used as reducer dependencies;
  their behavioral test coverage is preserved.
- **Runtime source**: in-repo minimal runtime in Core preserving IMRX semantics,
  or the IMRX package dependency — either satisfies this DoD; the choice and
  its rationale are recorded in the ADR.

## Definition of Done

Each criterion is PASS/FAIL. The refactor is done only when every criterion
passes.

### Core machines

1. **Two machine type families exist in `FolioTellCore`.** Transport and
   position each have `State`, `Event`, `Effect` types, a pure reducer, and an
   effect handler.
   - Check: list `foliotell/Sources/Core/`; inspect the two type families.
   - Expect: both families present with all five roles (state, event, effect,
     reducer, effect handler).

2. **Core stays framework-free.**
   - Check: `grep -rEn "import (AVFoundation|SwiftUI|UIKit|Combine)" foliotell/Sources/Core/`
     (Combine allowed only in the runtime file if the in-repo runtime option is
     chosen; zero occurrences elsewhere).
   - Expect: no framework imports in domain, reducer, or effect-handler files;
     no `UserDefaults` or `AVSpeechSynthesizer` reference anywhere in Core.

3. **Transition legality lives only in reducers.** Every `(state, event)` cell
   is handled explicitly; illegal, stale, duplicate, and out-of-order events are
   ignored deliberately. Utterance staleness (didFinish after stop, didCancel
   during replacement, willSpeakRange for a replaced utterance) is a reducer
   decision carried by event payload, not App-layer bookkeeping.
   - Check: `grep -rn "ignoredUtteranceIDs\|currentUtteranceID" foliotell/Sources/App/`;
     inspect reducer test suites for cell coverage.
   - Expect: grep is empty; for every event case, tests cover each state case
     (or an explicitly grouped ignore set), asserting state and effect as an
     adjacent pair.

4. **Effect handlers are collaborator-injected and spy-tested.** Synthesizer
   operations (speak/stop/pause/continue), audio session activation, and
   position persistence enter effect handlers as narrow closures or protocols.
   - Check: effect-handler init signatures; effect-handler test files.
   - Expect: tests include init-calls-no-collaborator coverage, assert
     collaborator payloads, and assert dispatched completion events via spies.

### Composition

5. **A single composition root constructs everything concrete.** Synthesizer
   adapter, position store, reducers, effect handlers, runtimes/view models,
   and schedulers are constructed in one named App-layer composition root.
   - Check: `grep -rn "AVSpeechSynthesizer()\|UserDefaults\|PositionStore()" foliotell/Sources/App/`.
   - Expect: concrete construction appears only in the composition root and
     adapter files; no view file constructs a dependency.

6. **Composition is wiring-tested.** Factory tests prove initial state and that
   injected collaborators receive expected payloads (success and failure
   propagation).
   - Check: App-layer test target exists and runs in `swift test`.
   - Expect: green factory/wiring tests; test doubles injected through visible
     seams, no hidden static state.

### Views

7. **Views follow the two-role contract.** Pure presentation views take
   `(state, event)`; a thin wrapper owns the observable model and delegates.
   No persistence calls, no position-mapping orchestration, no playback-state
   branching that selects between domain operations in any view file.
   - Check: `grep -rn "PlaybackPositionMapping\|positionStore\|UserDefaults" <view files>`;
     read view bodies.
   - Expect: grep empty; every enabled control dispatches a domain event;
     view bodies render from observed state only.

8. **Single observation channel.** No public mutable callback vars anywhere in
   App or Core; published state is `private(set)`; events enter through one
   funnel serialized on the injected scheduler.
   - Check: `grep -rEn "var on[A-Z][A-Za-z]*: \(" foliotell/Sources/`.
   - Expect: empty; runtime state property is `private(set)`.

### Behavior parity

9. **Existing user-visible behavior is preserved.** Play/pause/resume/stop;
   speed change mid-playback resumes at position (no restart from beginning);
   front-matter skip/read; voice list filtered by detected language with manual
   selection honored; previous/next sentence in idle, speaking, and paused
   states; per-document position persist and resume across close/reopen;
   progress ribbon advancing during playback. Accessibility identifiers are
   preserved.
   - Check: run the Maestro flows in `foliotell/.maestro/flows/` on the
     simulator against the refactored build.
   - Expect: all flows pass without flow edits (identifier-only edits are a
     FAIL — identifiers must not change).

10. **Existing Core behavioral coverage is preserved.** Normalization, position
    mapping, and voice-selection tests keep passing; files may move, but no
    behavioral test is deleted without an equivalent.
    - Check: `swift test` in `foliotell/`; diff of test names before/after.
    - Expect: green; every pre-refactor behavioral assertion has a surviving
      equivalent.

### Performance

11. **Position derivation is no longer per-word O(document).** Speech-text and
    source-offset derivation for a `(document, front-matter mode)` pair is
    computed once and reused; per-callback work is bounded by lookup, not by
    re-normalizing the document.
    - Check: inspect the position machine — derivation site and its cache
      residence in state; no derivation call in the per-callback path.
    - Expect: derivation invoked only on document load or mode change.

### Gates and governance

12. **Build and test gates are green.** `swift build` and `swift test` pass in
    `foliotell/`; PR CI passes including the archive job.
    - Check: run both commands; watch PR checks.
    - Expect: zero failures.

13. **The architecture decision is recorded as an ADR.** Pattern, two-machine
    decomposition, runtime-source choice, and rejected alternatives (single
    machine; status quo controller) documented per repo ADR governance.
    - Check: new file under `foliotell/docs/adr/`.
    - Expect: ADR present, consistent with the shipped code.

14. **New and moved Swift files are registered in the Xcode project.**
    - Check: `FolioTell.xcodeproj/project.pbxproj` diff lists every added
      App-target source file; CI archive job passes.
    - Expect: no unregistered file; archive green.

15. **Docs kept current.** Relevant log updated before push; README components
    table untouched or updated if the module surface changed.
    - Check: log diff in the PR.
    - Expect: one log entry for the refactor.

## Non-Goals

- No new features and no backlog items: no recent-documents library, no
  Markdown rendering improvements, no language override UI, no lock-screen or
  remote-transport work.
- No user-visible behavior change; parity (criterion 9) is the contract.
- No performance work beyond criterion 11.
- No changes outside `foliotell/` (shared scripts, other units, landing).
- No rewrite of the surviving pure Core functions.

## Unverifiable

- Real-device speech behavior (background/locked playback, on-device voice
  catalogs) cannot be checked from simulator CI; it remains covered by the
  existing backlog verification item and is explicitly outside this DoD.
