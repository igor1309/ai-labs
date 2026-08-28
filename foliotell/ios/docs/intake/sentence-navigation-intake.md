---
date: 2026-07-08
model: claude-fable-5
description: "Intake brief — fast forward / back buttons: one-sentence jumps in the reader bottom controls, active in every playback state"
---

# Intake Brief — Fast Forward / Back Buttons (Sentence Navigation)

## What I'm Building

Transport controls in the reader's bottom bar that move the listening
position backward or forward by **one sentence per tap** — the audiobook
gesture adapted to a text-driven engine. This implements the backlog item
"Add compact progress navigation controls" (`foliotell/backlog/product.md`).

Decisions from alignment (2026-07-08):

- **Unit**: one sentence per tap. Back jumps to the previous sentence start,
  forward to the next sentence start, relative to the sentence containing the
  current position.
- **Always enabled**: a tap moves the position regardless of playback state.
  While **speaking**, speech restarts from the target sentence and continues.
  While **paused**, the position moves silently, playback stays paused, and a
  subsequent resume speaks from the new position (not the old paused
  utterance). While **idle**, the tap silently moves the stored anchor/resume
  point; the progress bar is the visible feedback. A jump never *starts*
  audible playback — it only continues it if already running.
- **Base branch**: `foliotell/live-progress` — the feature builds on the
  unmerged word-granular progress commit (`c55ea814`), which touches the same
  bottom-controls code.

Stated defaults (accepted at capture): jumps clamp at the document's first
and last sentence (no wrap, no artificially triggered completion), and jumps
update the persisted anchor exactly as normal playback progression does.

## What I'm Touching

- `Sources/App/ReaderView.swift` — `playbackButtons(for:)` and the bottom
  controls container where the new buttons land; resume-offset plumbing.
- `Sources/App/SpeechController.swift` — the restart-at-offset machinery
  (`startSpeaking(startingAtUTF16Offset:)`) already powering speed/voice
  changes and resume; a speaking-state jump is the same operation with a
  different target offset. Paused/idle silent repositioning is new behavior
  for this controller.
- `Sources/Core/PlaybackPositionMapping.swift` — owns sentence boundaries and
  speech↔document offset mapping; natural home for "sentence boundary
  before/after a position" queries.
- `Tests/Core/PlaybackPositionMappingTests.swift` — new Core behavior gets
  tests here (strict TDD).

## Findings

- Scope: backlog item, current `ReaderView`/`SpeechController`/
  `PlaybackPositionMapping` state on `foliotell/live-progress`, and
  `foliotell/research/` grep for transport-control precedents; excluded
  landing/scripts.
- Pattern evidence: competitor patterns in the research inventory —
  rewind/play/forward panel (Apple Accessibility Reader), **sentence skip**
  (Narrate), 5-second skip (Voicen AI). The backlog chose the text-boundary
  framing; alignment confirmed sentence unit.
- The mechanics largely exist: utterance restart at an arbitrary speech-text
  offset (with `ignoredUtteranceIDs` handling replacement callbacks),
  sentence enumeration, and two-way speech↔document mapping
  (`documentAnchor`, `documentUTF16Offset`, `resumeSpokenUTF16Offset`).
- A jump that restarts speech automatically re-syncs the progress bar and the
  persisted anchor, because both are fed by `willSpeakRange` callbacks after
  any restart. Silent jumps (paused/idle) have no such callback path — their
  anchor/progress updates need an explicit path.
- Resume while paused currently means `continueSpeaking()` on the paused
  utterance (`SpeechController.pauseOrResume`); a paused jump followed by
  resume speaking from the new position is a behavioral change to that path.
- The technical spec's "Previous and Next navigation" (v0.0.2 section) is
  **file** navigation between folder documents — a different feature.

## Key Constraints

- Bottom safe-area inset only: play/pause, stop, speed, front-matter, and
  voice controls stay there; **no second toolbar and nothing above the
  document body** (explicit backlog boundary).
- The bar is already dense (settings menu with summary + progress bar + play
  + stop); two more buttons must fit compact widths.
- `AVSpeechSynthesizer` has no time-based seek — jumps are utterance restarts
  at text offsets; sentence boundaries are the unit (alignment decision).
- Jumps must not corrupt persistence: stored anchors stay sentence-anchored
  in document space (ADR-001 invariants untouched); a jump updates the anchor
  like normal progression.
- Clamping: back at the first sentence and forward at the last sentence clamp
  (no wrap, no artificial completion-clear).
- Strict TDD for Core additions; pbxproj registration for any new file
  (dual-build rule).

## Risks & Unknowns

- **Paused-state mechanics**: keeping the synthesizer paused while changing
  the future resume position does not fit the current
  `continueSpeaking()`-based resume — the paused utterance becomes stale
  after a jump. Getting pause → jump → resume right without audible glitches
  is the main implementation risk, and is only fully verifiable on device.
- **Rapid repeated taps** while speaking mean rapid utterance replacements;
  the replacement machinery handles ordering, but perceived responsiveness on
  device is unverified (same class as the old stop-latency finding).
- **Sentence granularity perception**: for long prose paragraphs (one
  Markdown line = one paragraph, often several sentences) sentence steps are
  fine-grained; alignment explicitly chose sentence anyway.
- **Layout fit** on small screens with two more 44pt controls next to the
  settings summary is unverified until built.
