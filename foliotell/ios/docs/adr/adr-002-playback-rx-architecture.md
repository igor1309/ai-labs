---
date: 2026-07-08
model: claude-fable-5
description: "Decision on FolioTell's playback architecture: two IMRX-style state machines (transport + position), an in-repo serialized runtime, a composition root, and two-role views."
status: accepted
---

# ADR-002 — Playback Rx Architecture

## Executive Summary

FolioTell's playback logic is structured as two composed IMRX-style state
machines in `FolioTellCore` — a **playback transport** machine (utterance
lifecycle) and a **playback position** machine (anchor persistence and
progress) — driven by an in-repo serialized runtime (`RxViewModel`), wired at
a composition root in the App layer, and rendered by two-role SwiftUI views
(pure presentation + observable-holding wrapper). Transition legality,
synthesizer-callback staleness, and persistence policy live exclusively in
pure reducers. Scope: the reader's playback path; document loading and global
settings storage are unchanged.

## Context

The previous App layer concentrated playback control, persistence policy, and
rendering in `ReaderView` (495 lines) and `SpeechController` (315 lines).
Transition legality lived in callers (`switch playbackState` in both files),
side-effect ordering was held by code order and comments, synthesizer-callback
staleness was tracked with an `ignoredUtteranceIDs` set plus an
`isReplacingUtterance` flag, and none of it was unit-testable: the synthesizer
and the position store were constructed inside their consumers with no seams.
The app's recorded bug history (settings-menu freeze, device speech, speed
changes restarting playback, playback-control states) sits entirely in this
untested shell; the Maestro flow existed as the regression net of last resort.

The pattern follows IMRX (github.com/igor1309/swift-imrx) and its production
use in swift-vortex: `State`/`Event`/`Effect` types, a pure reducer
`(State, Event) -> (State, Effect?)`, and an effect handler with injected
collaborators.

Rejected alternatives:

- **Single playback machine** owning both transport and persistence: recreates
  a machine that does too much; the position half is independently reusable
  (recent-documents backlog item).
- **IMRX package dependency**: the published runtime is Combine +
  `AnySchedulerOfDispatchQueue` from a pre-strict-concurrency era; FolioTell is
  a zero-dependency Swift 6.2 target. The runtime semantics (~100 lines) are
  carried in-repo instead, preserving IMRX's serialized event queue and
  `private(set)` published state.
- **Patching the legacy controller** (adding seams without restructuring):
  leaves transition legality distributed across callers, the defect class
  behind the bug history.

## Decision

Playback is implemented as two state machines in `FolioTellCore`, each with
`State`, `Event`, `Effect`, a pure reducer, and an effect handler with
injected collaborators, arranged in `<Machine>/Domain` and `<Machine>/Logic`
subfolders:

- **PlaybackTransport** owns the utterance lifecycle: play/pause/resume/stop,
  sentence jumps, speed/voice replacement, and synthesizer callbacks. Every
  synthesizer fact carries an **utterance token**; tokens are monotonic across
  idle (idle stores `lastUtteranceToken`), and the reducer ignores any
  callback or pause/resume resolution whose token does not match the current
  session.
- **PlaybackPosition** owns the per-document listening position: it consumes
  spoken-offset facts, derives document anchors via a cached
  `SpeechDerivation` (speech text, source offsets, and sentence starts,
  computed once per document/front-matter-mode pair), and emits
  persist/clear effects against the position store.

The machines are driven by `RxViewModel<State, Event, Effect>`: a
`@MainActor` runtime with one event funnel, FIFO processing of
effect-dispatched follow-up events, an injected `EventScheduler`, and
`@Published private(set)` state.

Cross-machine communication is wired only at the composition root
(`ReaderComposition` in the App layer): transport effects forward
finished/start-over/idle-jump facts as position events; a Combine binder maps
transport spoken-offset state changes to position events. The synthesizer is
reached through the `SpeechSynthesisControlling` protocol owned by the
composition root and implemented by `SpeechSynthesizerAdapter`
(AVFoundation), which maps `SpeakCommand.utteranceToken` to
`AVSpeechUtterance` instances and dispatches delegate callbacks back as
events.

Views follow two roles: `ReaderView` is a pure `(state, event)` function;
`ReaderSessionView` observes the two models, holds the `@AppStorage` global
settings (per ADR-001), and maps between render state and domain events;
`ReaderScreen` owns the session lifecycle via an injected factory.

## Rules / Invariants

- Reducers MUST be pure; every `(state, event)` cell MUST be explicit, and
  stale, duplicate, or out-of-order events MUST be ignored by the reducer,
  not by App-layer bookkeeping.
- Utterance tokens MUST be monotonic across the machine's lifetime; a
  terminal callback for a stale token MUST NOT affect the current session.
- Core MUST NOT import AVFoundation, SwiftUI, or UIKit; Combine is allowed
  only in `RxViewModel.swift`. `UserDefaults` and `AVSpeechSynthesizer` MUST
  NOT appear in Core.
- Effect handlers MUST receive collaborators as narrow injected
  closures/protocols and MUST be spy-testable, including
  init-calls-no-collaborator coverage.
- All concrete construction (synthesizer adapter, position store, reducers,
  handlers, models, schedulers) MUST happen in the composition root; view
  files MUST NOT construct dependencies or call persistence.
- `SpeechDerivation` MUST be rebuilt only on document load or front-matter
  mode change; per-spoken-word work MUST be bounded by lookup
  (binary search over cached sentence starts).
- Observation MUST flow through `@Published private(set)` state and a single
  `event(_:)` funnel; public mutable callback vars are forbidden.
- The speech pipeline MUST only delete characters (subsequence invariant) —
  the greedy alignment in `SpeechDerivation` depends on it.

## Consequences

- The playback bug surface (replacement cancels, didFinish-after-stop,
  pause/resume races, speed-change restarts) is unit-tested cell by cell;
  two Codex adversarial review rounds hardened token monotonicity,
  token-scoped pause/resume resolutions, and the paused word boundary.
- Composition wiring is test-proven (`FolioTellAppTests` with store and
  synthesizer spies), so the finish flow's ordering (offset events precede
  clear) is pinned.
- Per-word position work dropped from two O(document) re-derivations per
  spoken word to array lookups plus binary searches.
- Tradeoff accepted: more types and files per behavior; the two-machine split
  costs explicit composition-root wiring.
- Extension point: the position machine and its store seam are the natural
  substrate for the recent-documents backlog item.

## Non-Goals

- No change to document loading (`FolioFileDocument`, `FolioDocumentLoader`)
  or global settings storage (`@AppStorage`, per ADR-001).
- No new user-visible behavior; behavior parity with the legacy controller is
  the contract.
- No lock-screen/remote transport, background-audio, or recent-documents
  work.
- No generalization of the runtime beyond FolioTell's needs.
