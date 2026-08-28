---
date: 2026-07-08
model: claude-fable-5
description: "Intake brief — persist playback position per document and resume with backwards overlap"
---

# Intake Brief — Persist Playback Position and Resume

## What I'm Building

FolioTell currently forgets everything when a document closes: position lives
only in an in-memory `PlaybackStateMachine`, and `ReaderView.onDisappear`
stops speech. This item makes the listening position durable per document —
after stopping, closing the document, or relaunching the app, opening the same
document lets the user continue from where speech last was, not from the top.
Position is recorded at a stable text boundary (sentence or paragraph range,
not a raw character offset), a compact progress indicator appears in the
reader, and the persisted position is keyed per document, separate from the
existing global `@AppStorage` settings. Changing speed or voice must not reset
position — that already holds in-session; it must keep holding across the new
persistence.

Resume replays from the start of the interrupted sentence (backwards overlap
for context regain). Overlap is defined in text units, not seconds, because
the speech engine is text-driven — `AVSpeechSynthesizer` has no time-based
seek — and elapsed time per word varies with the speed setting. Sentence-start
resume typically yields the desired 1–3 seconds of replay; an extra-sentence
rewind is a post-device-testing tuning decision, not a configurable feature
now.

## What I'm Touching

- `Sources/Core/PlaybackStateMachine.swift` — the only position tracker today
  (`currentSpokenUTF16Offset`, fed by `willSpeakRange`); pure, `Equatable`,
  well-tested.
- `Sources/App/SpeechController.swift` — owns the state machine, already
  restarts mid-stream from `currentSpokenUTF16Offset` on speed/voice change
  (`updateSpeed` / `updateVoiceIdentifier`); the natural read-point for
  "where are we now".
- `Sources/App/ReaderView.swift` — global settings via `@AppStorage`, bottom
  control surface, `onDisappear` stop; home of the progress affordance.
- `Sources/App/FolioTellApp.swift` — `DocumentGroup` provides
  `configuration.fileURL`, currently only used for the file name; per-document
  identity has to originate here.
- New Core source(s) + tests, plus `FolioTell.xcodeproj/project.pbxproj`
  registration (all four sections — dual-build rule).

## Findings

- Scope: all 12 Swift sources, the test suite layout, technical spec, backlog,
  log, and `.agents/foliotell.md`; excluded landing page, scripts, research.
- Pattern evidence: persistence exists only as global `@AppStorage` (speed,
  front-matter mode, voice) in `ReaderView`. No per-document storage anywhere.
  In-memory position tracking is the closest analog: synthesizer's
  `willSpeakRangeOfSpeechString` → `playback.willSpeakRange` → UTF16 offset.
- The tracked offset points into the **normalized speech text** —
  `SpeechTextNormalization.speechText(from:
  frontMatterMode.speechText(from: document.text))` — not into the document
  text. That space shifts whenever the front-matter mode toggles or the
  normalization algorithm changes between app versions.
- No sentence/paragraph boundary model exists in Core; the synthesizer reports
  word-level ranges.
- Document identity: `FolioFileDocument` is read-only and identity-free; only
  `fileURL` at the `DocumentGroup` level identifies a document.
- "Preserve playback position per document" already appears in the technical
  spec's v0.0.2 plan (`docs/specs/foliotell-technical-spec.md:115`) — planned,
  never implemented.
- Conventions: Core is platform-free Swift tested with swift-testing (`@Test`,
  `#expect`, `test_method_shouldOutcome_onCondition` naming, private
  projection structs as helpers); strict TDD and protocol-owned-by-client
  rules apply; `swift test` locally plus the `xcodebuild archive` wrapper for
  CI parity.

## Key Constraints

- Local and offline only — no account, sync, analytics, backend (backlog +
  spec non-goals).
- Position keyed per document, independent of the global `@AppStorage`
  settings. Document identity is **path-based** (the document's `fileURL`) for
  this item; rename/move survival (security-scoped bookmarks) is deferred to
  the recent-documents backlog item (decided 2026-07-08).
- Stable text boundary: a raw UTF16 offset into normalized speech text does
  not qualify — it must survive front-matter mode changes and normalization
  tweaks.
- Resume starts at the beginning of the interrupted sentence — backwards
  overlap expressed in text units (decided 2026-07-08).
- Speed/voice change must not reset position (regression guard on existing
  behavior).
- Progress affordance stays compact and inside the existing bottom control
  surface — the related navigation backlog item explicitly forbids a second
  toolbar.
- Stop now preserves position: the backlog lists "stopping" among the resume
  cases, so today's stop-means-start-over semantics changes.
- New Swift sources must be registered in the Xcode project wrapper or CI
  archive fails.

## Risks & Unknowns

- **Position-space mapping.** Spoken offsets arrive in normalized-speech
  space; a stable boundary must be expressed against something durable
  (document text). No mapping between the two spaces exists — this is the main
  new modeling work and the main correctness risk.
- **Document identity durability.** Paths from Files providers can change on
  rename/move; accepted for this item (see Key Constraints), positions are
  lost on rename until the recent-documents item lands bookmarks.
- **External document edits.** A document changed between sessions can
  invalidate a saved position; clamping exists only in speech space today.
- **When to persist.** `onDisappear` fires on document close, but
  force-kill/relaunch must also resume — persistence can't rely on a single
  teardown hook.
- **Front-matter mode is global**, so the same document's speech text differs
  by mode; a boundary anchored to document text sidesteps this, but resume
  behavior when the saved position falls inside skipped front matter needs a
  defined outcome.
