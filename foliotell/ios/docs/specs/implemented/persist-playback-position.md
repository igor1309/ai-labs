---
date: 2026-07-08
model: claude-fable-5
description: "Spec: per-document playback position persistence and sentence-anchored resume"
---

# Spec: Persist Playback Position (v1)

Spec for the backlog item "Persist playback position and resume" in
`foliotell/backlog/product.md`. Intake:
[`../../intake/persist-position-intake.md`](../../intake/persist-position-intake.md).
Architecture: [ADR-001](../../adr/adr-001-per-document-playback-position.md).

## Goal

A pure `FolioTellCore` mapping between spoken offsets (speech-text space) and
sentence anchors in the raw document text, plus App-layer persistence and
resume wiring, so a document reopened after stop, close, or relaunch resumes
speaking from the start of the interrupted sentence. Mapping is owned by
`FolioTellCore`; the store protocol and wiring are owned by the App layer.

## Public interface

Core (new, `Sources/Core/PlaybackPositionMapping.swift`):

```swift
public enum PlaybackPositionMapping {
    /// Document-text UTF16 offset of the start of the sentence being spoken
    /// at `spokenUTF16Offset` in the derived speech text.
    public static func documentAnchor(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        spokenUTF16Offset: Int
    ) -> Int

    /// Document-text UTF16 offset of the speech-text position, without
    /// snapping to a sentence start. Drives live progress display; persisted
    /// positions use `documentAnchor` instead. (Amendment 2026-07-08.)
    public static func documentUTF16Offset(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        spokenUTF16Offset: Int
    ) -> Int

    /// Speech-text UTF16 offset at which playback resumes a stored anchor.
    public static func resumeSpokenUTF16Offset(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        documentAnchor: Int
    ) -> Int
}
```

Speech text is the existing pipeline output:
`SpeechTextNormalization.speechText(from: frontMatterMode.speechText(from: documentText))`.
Sentences are Foundation `.bySentences` enumeration ranges over the relevant
text; a sentence's start is its enumeration range start.

App layer (wiring surface, not unit-tested — consistent with the existing App
target):

```swift
@MainActor
protocol PlaybackPositionStore: AnyObject {
    func anchor(forDocumentPath path: String) -> Int?
    func setAnchor(_ anchor: Int, forDocumentPath path: String)
    func clearAnchor(forDocumentPath path: String)
}

final class DefaultsPlaybackPositionStore: PlaybackPositionStore { ... }
```

`SpeechController` additions: `play(...)` accepting a starting speech-text
UTF16 offset (exposing the existing private restart path), a
spoken-position-change callback, and a natural-completion callback so the
reader can record anchors and clear the record. `ReaderView` receives the
document's `fileURL` path from `FolioTellApp`.

## Behavior rules

Core mapping:

1. **Sentence anchoring.** `documentAnchor` returns the UTF16 offset of the
   start of the document sentence whose spoken form contains
   `spokenUTF16Offset`.
2. **Resume at sentence start.** `resumeSpokenUTF16Offset` returns the
   speech-text offset where the anchored sentence's spoken form begins —
   the agreed backwards overlap.
3. **Round trip never overshoots.** For any spoken offset `o`,
   `resumeSpokenUTF16Offset(documentAnchor(o))` is ≤ `o` and is a spoken
   sentence start. Resume never lands past the interrupted point.
4. **Markup independence.** Anchoring identifies the correct source sentence
   when speech offsets differ from document offsets because normalization
   stripped markers (headings, emphasis, links, list and quote markers).
5. **Front-matter accounting.** Anchors are document-space (they include the
   front-matter span). Under `.skip`, spoken offsets count only body text;
   the mapping accounts for the skipped prefix.
6. **Mode-stable anchors.** A body-sentence anchor saved under one
   front-matter mode resumes the same sentence under the other mode.
7. **Anchor in skipped front matter.** Under `.skip`, an anchor inside the
   front-matter span resumes at spoken offset 0.
8. **Out-of-range anchor.** An anchor beyond the document's UTF16 length
   resumes at spoken offset 0.
9. **Misaligned anchor.** An anchor that is not a sentence start (document
   edited externally) snaps to the start of the sentence containing it.
10. **Purity.** Both functions are deterministic, side-effect-free, and use
    no imports beyond Foundation.

App integration:

11. **Identity.** The persistence key is the document's `fileURL` path. When
    no path is available, persistence is disabled and playback behaves as
    today.
12. **Write on sentence transition.** During playback, when the computed
    anchor changes (speech crossed into a new document sentence), the store
    updates; equal anchors are not rewritten. This bounds force-kill loss to
    the sentence in progress.
13. **Stop preserves.** Stop writes the current anchor and keeps the record.
14. **Completion clears.** Natural end-of-document completion (`didFinish`
    without a pending stop) clears the record; the next play starts from the
    beginning.
15. **Resume on play.** Play from idle with a stored anchor starts speech at
    `resumeSpokenUTF16Offset`; without one, from the beginning.
16. **Speed/voice never reset.** Speed and voice changes keep the existing
    mid-stream restart behavior and do not change the stored anchor.
17. **Position only.** The record stores the anchor only; global `@AppStorage`
    settings are untouched.
18. **Start Over.** The reader settings menu gains a "Start Over" action,
    enabled when a stored anchor exists or playback is active: it clears the
    record and, if speech is active, restarts from the beginning.
19. **Progress affordance.** A thin, non-interactive progress indicator sits
    inside the existing bottom controls container (no second toolbar, nothing
    above the document body). During playback its value is the live
    word-granular document offset (`documentUTF16Offset`) over
    `documentText.utf16.count`; when idle it falls back to
    `anchor / documentText.utf16.count` (0 with no record). *Amended
    2026-07-08: the original sentence-transition-only updates left the bar
    visibly stalled on short documents (device finding on v0.2.0).*
20. **Store implementation.** `DefaultsPlaybackPositionStore` uses
    `UserDefaults.standard` with key `"playbackPositionAnchor:<path>"` and an
    integer anchor value; `clearAnchor` removes the key.

## Product intent traceability

Backlog bullets → rules: "track progress at a stable text boundary" → rules
1, 4–6, 10; "resume after closing, reopening, stopping, or relaunching" →
rules 11–15; "compact progress affordance" → rule 19; "per-document position
independent from global settings" → rules 11, 17, 20; "changing speed or
voice does not reset playback" → rule 16; intake backwards-overlap decision →
rules 2–3; ADR-001 safe-degradation invariant → rules 7–9.

## Tests (required)

Pure mapping tests in `Tests/Core/PlaybackPositionMappingTests.swift`:

1. `test_documentAnchor_shouldReturnZero_onOffsetInFirstSentence` — rule 1.
2. `test_documentAnchor_shouldReturnSecondSentenceStart_onOffsetInSecondSentence`
   — rule 1.
3. `test_documentAnchor_shouldReturnSentenceStart_onHeadingMarkerBeforeSentence`
   — rule 4 (speech offsets shifted by stripped `#` marker).
4. `test_documentAnchor_shouldReturnSentenceStart_onListItemSentence` — rule 4.
5. `test_documentAnchor_shouldReturnDocumentSpaceAnchor_onSkippedFrontMatter`
   — rule 5 (anchor includes front-matter span the speech text lacks).
6. `test_documentAnchor_shouldReturnSameAnchor_onReadModeFrontMatter` — rules
   5–6 (same body sentence, `.read` mode).
7. `test_resumeSpokenUTF16Offset_shouldReturnSpokenSentenceStart_onBodyAnchor`
   — rule 2.
8. `test_resumeSpokenUTF16Offset_shouldNotExceedOriginalOffset_onRoundTrip`
   — rule 3 (mid-sentence offset round-trips to that sentence's spoken start).
9. `test_resumeSpokenUTF16Offset_shouldResumeSameSentence_onModeChangedBetweenSaveAndResume`
   — rule 6.
10. `test_resumeSpokenUTF16Offset_shouldReturnZero_onAnchorInsideSkippedFrontMatter`
    — rule 7.
11. `test_resumeSpokenUTF16Offset_shouldReturnZero_onAnchorBeyondDocumentLength`
    — rule 8.
12. `test_resumeSpokenUTF16Offset_shouldSnapToSentenceStart_onMisalignedAnchor`
    — rule 9.
13. `test_documentAnchor_shouldReturnSentenceStart_onRussianSentences` — rules
    1, 4 on a Pushkin-shaped Russian Markdown sample (Cyrillic `.bySentences`
    segmentation).
14. `test_resumeSpokenUTF16Offset_shouldStartAtSentenceStart_onEmphasisInsideSentence`
    — rules 2, 4 (inline markers inside the anchored sentence).

Amendment 2026-07-08 (live progress):

15. `test_documentUTF16Offset_shouldReturnUnsnappedDocumentOffset_onHeadingMarkerBeforeSentence`
    — rule 19 amendment (unsnapped mapping distinct from `documentAnchor`).
16. `test_documentUTF16Offset_shouldClampToLastSpokenUnit_onOffsetBeyondSpeechEnd`
    — rule 19 amendment (bounded lookup).

App-layer rules 11–20 are wiring over the tested Core mapping plus the
existing restart machinery; they are verified by build gates and an on-device
pass (see Done criteria), consistent with the untested-App-target precedent.

## Done criteria

- `PlaybackPositionMapping` exists in `FolioTellCore` with the interface
  above; no new package dependencies; registered in
  `FolioTell.xcodeproj/project.pbxproj`.
- All listed tests pass (`swift test` green in `foliotell/`); existing Core
  tests pass unchanged.
- App wiring implements rules 11–20: store protocol + UserDefaults
  implementation, sentence-transition writes, stop/completion semantics,
  resume on play, Start Over menu action, progress indicator.
- `xcodebuild archive` wrapper build green (CI parity command in
  `.agents/foliotell.md`).
- On-device verification checklist: stop → play resumes at interrupted
  sentence start; relaunch → play resumes; finish → replay starts from top;
  speed/voice change mid-listen keeps position; Start Over restarts.

Out of scope: security-scoped bookmarks, recent-documents library,
per-document speed/voice/front-matter persistence, previous/next-sentence
navigation, scrubbable progress UI.
