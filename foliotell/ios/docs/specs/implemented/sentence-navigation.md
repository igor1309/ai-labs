---
date: 2026-07-08
model: claude-fable-5
description: "Spec: sentence navigation — fast forward / back buttons active in every playback state"
---

# Spec: Sentence Navigation (v1)

Delta mini-spec (my-way minor-feature path) for the backlog item "Add compact
progress navigation controls" in `foliotell/backlog/product.md`. Intake:
[`../../intake/sentence-navigation-intake.md`](../../intake/sentence-navigation-intake.md).
Builds on the persist-position feature
([ADR-001](../../adr/adr-001-per-document-playback-position.md), implemented
spec [`persist-playback-position.md`](persist-playback-position.md))
and the word-granular progress commit on `foliotell/live-progress`.

## Goal

Back/forward buttons in the reader's bottom controls that move the listening
position by one sentence per tap in every playback state — restarting speech
when speaking, silently repositioning when paused or idle. Sentence-boundary
queries are owned by `FolioTellCore`; button wiring and state handling by the
App layer.

## Public interface

Core (additions to `PlaybackPositionMapping`; generic sentence queries over
any text, applied to the speech text by callers):

```swift
extension PlaybackPositionMapping {
    /// UTF16 offset of the start of the sentence preceding the one that
    /// contains `utf16Offset`; 0 when the containing sentence is the first.
    public static func previousSentenceStartUTF16Offset(
        in text: String,
        from utf16Offset: Int
    ) -> Int

    /// UTF16 offset of the start of the sentence following the one that
    /// contains `utf16Offset`; nil when the containing sentence is the last.
    public static func nextSentenceStartUTF16Offset(
        in text: String,
        from utf16Offset: Int
    ) -> Int?
}
```

Core (`PlaybackStateMachine` addition):

```swift
/// Moves the tracked position without changing the playback state.
public mutating func reposition(toUTF16Offset: Int)
```

App layer (wiring surface, not unit-tested — existing precedent):
`SpeechController` gains `jumpToPreviousSentence()` / `jumpToNextSentence()`
operating on the current speech text; `ReaderView` gains the two buttons and
an idle-state jump path over the store + mapping.

## Behavior rules

Core:

1. **Previous.** `previousSentenceStartUTF16Offset` returns the start of the
   sentence preceding the sentence containing the offset. When the containing
   sentence is the first, it returns 0 (back at the start replays the
   beginning). Offsets in inter-sentence whitespace belong to the preceding
   sentence (consistent with the existing containing-sentence convention).
2. **Next.** `nextSentenceStartUTF16Offset` returns the start of the sentence
   following the sentence containing the offset, and `nil` when the
   containing sentence is the last — forward at the end is a no-op (no wrap,
   no replay, no artificial completion).
3. **Reposition.** `PlaybackStateMachine.reposition(toUTF16Offset:)` updates
   the utterance-start and spoken offsets (bounded to the current text, like
   `startSpeaking`) and preserves the playback state;
   `remainingTextFromCurrentSpeechBoundary` reflects the new position.
4. **Purity.** The sentence queries are deterministic, Foundation-only, and
   side-effect-free.

App:

5. **Buttons.** Back and forward buttons join the playback controls in the
   existing bottom container (no second toolbar): back · play/pause ·
   forward · stop. SF Symbols `backward.fill` / `forward.fill`, 44pt targets,
   accessibility labels "Previous sentence" / "Next sentence", identifiers
   `previousSentenceButton` / `nextSentenceButton`.
6. **Always enabled.** The buttons are enabled in every playback state; a
   jump never starts audible playback and never stops it.
7. **Speaking jump.** While speaking, a tap restarts speech at the target
   sentence start (same utterance-replacement machinery as speed/voice
   changes) and playback continues.
8. **Paused jump.** While paused, a tap discards the paused utterance
   silently (no audio), repositions the state machine to the target, keeps
   the `.paused` state, and reports the new position through the existing
   position-change callback. A subsequent resume speaks from the new
   position: the resume path falls back to restarting from the tracked
   offset when `continueSpeaking()` has nothing to continue.
9. **Idle jump.** While idle, a tap moves the resume point without the
   controller: current position = stored anchor mapped to a spoken offset
   (document start when no record), stepped one sentence, mapped back to a
   document anchor, persisted, and reflected in the progress bar.
10. **Persistence consistency.** Jumps update the stored anchor exactly like
    normal progression: speaking jumps re-sync via `willSpeakRange` after the
    restart; paused jumps via the position-change callback; idle jumps via
    the explicit store write. ADR-001 invariants are untouched.
11. **Clamps.** Back in the first sentence restarts/moves to offset 0;
    forward in the last sentence does nothing (rule 2's `nil`).

## Product intent traceability

Backlog bullets → rules: "previous/next sentence or paragraph navigation"
(sentence per 2026-07-08 alignment) → rules 1–2, 5–9; "keep the primary
controls in the bottom safe-area inset" → rule 5; "avoid a second toolbar or
controls above the document body" → rule 5. Alignment decisions: always
enabled / silent reposition → rules 6, 8–9; clamp defaults → rules 1–2, 11.

## Tests (required)

`Tests/Core/PlaybackPositionMappingTests.swift`:

1. `test_previousSentenceStartUTF16Offset_shouldReturnPrecedingSentenceStart_onOffsetInSecondSentence`
   — rule 1.
2. `test_previousSentenceStartUTF16Offset_shouldReturnZero_onOffsetInFirstSentence`
   — rules 1, 11.
3. `test_previousSentenceStartUTF16Offset_shouldTreatGapAsPrecedingSentence_onOffsetInWhitespaceBetweenSentences`
   — rule 1.
4. `test_nextSentenceStartUTF16Offset_shouldReturnFollowingSentenceStart_onOffsetInFirstSentence`
   — rule 2.
5. `test_nextSentenceStartUTF16Offset_shouldReturnNil_onOffsetInLastSentence`
   — rules 2, 11.
6. `test_nextSentenceStartUTF16Offset_shouldReturnFollowingSentenceStart_onRussianSentences`
   — rules 2, 4 (Cyrillic `.bySentences` segmentation).

`Tests/Core/PlaybackStateMachineTests.swift`:

7. `test_reposition_shouldKeepPausedStateAndMoveOffsets_onPausedReposition`
   — rule 3.
8. `test_reposition_shouldBoundOffsetToTextLength_onOffsetBeyondText` —
   rule 3.
9. `test_remainingTextFromCurrentSpeechBoundary_shouldReturnSuffixFromNewPosition_onReposition`
   — rule 3.

App rules 5–11 are wiring over tested Core behavior; verified by build gates
and the on-device pass (existing precedent).

## Done criteria

- Core additions exist with the interfaces above; no new files, no new
  dependencies (no pbxproj change needed).
- All listed tests pass; the full suite (`swift test` in `foliotell/`) stays
  green with existing tests unchanged.
- App wiring implements rules 5–11.
- `xcodebuild archive` CI-parity wrapper green.
- On-device checklist (user pass): back/forward while speaking jump audibly
  by one sentence; paused jumps are silent and resume speaks from the new
  spot; idle jumps move the progress bar and the resume point; ends clamp
  per rule 11.
- No push — local commits only (explicit 2026-07-08 instruction).

Out of scope: paragraph-unit jumps, long-press/repeat acceleration,
time-based skips, scrubbable progress, lock-screen/remote transport commands.
