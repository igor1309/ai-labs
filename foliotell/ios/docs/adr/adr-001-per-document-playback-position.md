---
date: 2026-07-08
model: claude-fable-5
description: "Decision on how FolioTell persists per-document playback position: document-text sentence anchor, path-keyed, client-owned store protocol."
status: proposed
---

# ADR-001 — Per-Document Playback Position Persistence

## Executive Summary

FolioTell persists the playback position of each document as a sentence anchor
expressed in the raw document text, keyed by the document's file URL path, and
stored locally behind a store protocol owned by its client with a
UserDefaults-backed first implementation.

Position durability does not depend on view teardown; the anchor is saved as
speech crosses sentence boundaries. Resume restarts speech at the anchored
sentence's start, which provides the agreed backwards overlap.

This ADR decides position representation, the offset-traceability contract on
the speech-text derivation, storage ownership, document identity, and resume
semantics. It does not decide UI form, per-document settings, or a
recent-documents library.

## Context

Playback position currently lives only in an in-memory `PlaybackStateMachine`
(`Sources/Core/PlaybackStateMachine.swift`), and `ReaderView.onDisappear`
stops speech — closing a document, stopping, or relaunching the app loses the
listening place. The backlog item "Persist playback position and resume"
(`backlog/product.md`) requires resume across stop, close, reopen, and
relaunch, tracked at a stable text boundary, per document, with speed and
voice changes never resetting position. Intake decisions (2026-07-08,
`docs/intake/persist-position-intake.md`): resume replays from the start of
the interrupted sentence (backwards overlap in text units), and document
identity is path-based for this item.

The structural tension: the synthesizer reports progress as UTF16 offsets into
the **normalized speech text** — the output of
`FrontMatterPlaybackMode.speechText(from:)` followed by
`SpeechTextNormalization.speechText(from:)` — but that space shifts whenever
the front-matter mode toggles or the normalization algorithm changes between
app versions. Only the raw document text is durable across sessions.

Rejected alternatives:

- **Persist the spoken offset in normalized speech space.** Invalidated by any
  front-matter mode toggle or normalization change; fails the stable-boundary
  requirement.
- **Percentage-based position.** Cannot land on a sentence start, so no
  deterministic backwards overlap; drifts under document edits.
- **SwiftData / Core Data / dedicated file store.** Disproportionate to one
  small record per document; the app's only persistence precedent is
  UserDefaults (`@AppStorage` in `ReaderView.swift`).
- **Security-scoped bookmark identity.** Deferred to the recent-documents
  backlog item by the intake decision; path identity is accepted for this
  item.

## Decision

The persisted playback position MUST be a sentence anchor expressed in the raw
document text (`FolioDocument.text`): the UTF16 offset of the start of the
sentence being spoken when the position was recorded.

The speech-text derivation pipeline (front-matter filtering + normalization)
MUST expose source-offset traceability: a deterministic, pure mapping from
offsets in the normalized speech text back to offsets in the document text.
This mapping lives in the Core module. Its exact API shape is spec-level.

Position persistence MUST sit behind a protocol owned by its client in the App
layer, with the first implementation backed by UserDefaults. The persistence
key MUST be derived from the document's file URL path
(`DocumentGroup` provides `configuration.fileURL`,
`Sources/App/FolioTellApp.swift`).

The anchor MUST be saved as playback progresses. Because the representation is
sentence-granular, the persisted value changes only at sentence transitions;
saving at those transitions bounds the loss after a force-kill to the sentence
in progress. Durability MUST NOT depend on a single teardown hook such as
`onDisappear`.

Resume semantics:

- Starting playback on a document with a stored anchor MUST begin speech at
  that sentence's start.
- Stop MUST preserve the stored anchor (stop no longer means
  start-from-the-top).
- Speech reaching the end of the document MUST clear the stored anchor, so
  a finished document replays from the beginning.
- An anchor that no longer resolves — the document changed externally, or the
  anchored text is excluded by the current front-matter mode — MUST degrade
  safely to the nearest valid boundary or the document start, and MUST NOT
  crash or speak out of bounds. The exact fallback rules are spec-level.

## Rules / Invariants

- The persisted record MUST NOT contain offsets into normalized speech text.
- Records MUST be keyed per document path; two documents MUST NOT share or
  overwrite each other's position.
- The record introduced by this ADR stores position only; the global
  `@AppStorage` settings (speed, front-matter mode, voice) stay global and
  MUST NOT move into it.
- Changing speed or voice MUST NOT reset the anchor (guards the existing
  mid-stream restart behavior in `SpeechController.updateSpeed` /
  `updateVoiceIdentifier`).
- All position mapping and boundary logic MUST live in the Core module and
  MUST stay platform-free (no AVFoundation/SwiftUI imports); the App layer
  only adapts synthesizer callbacks and storage.
- The store protocol MUST live in the same module as its client
  (protocol-owned-by-client rule).
- New Swift sources MUST be registered in `FolioTell.xcodeproj/project.pbxproj`
  (dual-build rule, `.agents/foliotell.md`).

## Consequences

- Stop-button semantics change from "reset to top" to "park here"; the spec
  must define how a user deliberately starts over.
- Positions are lost when a document is renamed or moved (path identity) —
  accepted until the recent-documents item introduces bookmarks; the store
  protocol is the seam where a bookmark-based key can replace the path key.
- The per-document record is the natural extension point for the
  recent-documents item (per-document speed, voice, front-matter mode later);
  this ADR fixes only the position field.
- Normalization algorithm changes between app versions no longer invalidate
  stored positions, because anchors point into document text.
- Building the resume utterance from a mid-document sentence means running the
  derivation pipeline on a document suffix; suffix edge cases (e.g. an anchor
  inside a code fence) become spec-level concerns of the mapping contract.
- UserDefaults accumulates one small record per opened document, unbounded;
  acceptable at this scale, pruning belongs to the recent-documents item.

Mechanism feasibility evidence:

- Progress reporting: `willSpeakRangeOfSpeechString` already drives
  `playback.willSpeakRange` (`Sources/App/SpeechController.swift`).
- Offset-based restart: already shipped for speed/voice changes via
  `startSpeaking(startingAtUTF16Offset:)` and
  `remainingTextFromCurrentSpeechBoundary`
  (`Sources/Core/PlaybackStateMachine.swift`).
- Sentence segmentation in platform-free Core: Foundation's
  `String.enumerateSubstrings(in:options:)` with `.bySentences` — Foundation
  is already imported by Core (`Sources/Core/FolioDocument.swift`).
- Local keyed persistence: UserDefaults precedent via `@AppStorage`
  (`Sources/App/ReaderView.swift`).
- Document identity source: `configuration.fileURL` in `DocumentGroup`
  (`Sources/App/FolioTellApp.swift`).

## Non-Goals

- No recent-documents library, no security-scoped bookmarks, no pruning.
- No per-document persistence of speed, voice, or front-matter mode.
- No previous/next-sentence navigation controls (separate backlog item).
- No decision on the progress affordance's visual form — the feature includes
  a compact progress indicator, but its UX shape is spec-level, not
  architectural.
- No sync, account, analytics, or backend of any kind.
