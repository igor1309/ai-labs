---
date: 2026-07-13
author: Igor Malyarov
title: FolioTell Android — Technical Specification
version: 0.0.1
status: draft
---

# FolioTell Android — Technical Specification

## v0.0.1

Stage 1 of the [Android roadmap](../../../docs/foliotell-android-roadmap.md):
parity with the iOS technical spec's v0.0.1 core scope
(`foliotell/ios/docs/specs/foliotell-technical-spec.md`) on Android idioms.

### Goal

A native Android app that opens a local Markdown or plain-text file via the
system document picker and reads it aloud with the platform `TextToSpeech`
engine — Play, Pause/Resume, Stop, five speed presets. Document
validation/loading, utterance chunking, speed mapping, and the playback state
machine live in the pure-JVM `:core` module; the Compose UI and the
`TextToSpeech` effect handler live in `:app` (roadmap decision 7).

### Constraints

- Kotlin + Jetpack Compose + platform `android.speech.tts.TextToSpeech`;
  native frameworks only (ADR-003).
- Read-only document access via SAF per-document grants; no other permissions.
- Fully offline; no account, backend, analytics, subscription, or network
  dependency.
- `minSdk = 35` — provisional per roadmap decision 8; verify against the
  physical test device before the Stage 2 first install.

### Public interface (`:core`)

All types in `dev.igor1309.foliotell.core`.

```kotlin
enum class SpeedPreset(val rate: Float, val label: String) {
    X1(1.0f, "1×"),
    X1_25(1.25f, "1.25×"),
    X1_5(1.5f, "1.5×"),
    X1_75(1.75f, "1.75×"),
    X2(2.0f, "2×");

    companion object {
        val DEFAULT: SpeedPreset // X1
        fun fromName(name: String?): SpeedPreset
    }
}

data class Document(val name: String, val text: String)

enum class LoadError { EMPTY, INVALID_ENCODING }

sealed interface LoadResult {
    data class Loaded(val document: Document) : LoadResult
    data class Failed(val error: LoadError) : LoadResult
}

object DocumentLoader {
    fun load(bytes: ByteArray, name: String): LoadResult
}

object UtteranceChunker {
    fun chunk(text: String, maxChunkLength: Int): List<String>
}

sealed interface PlaybackState {
    data object Idle : PlaybackState
    data class Speaking(val chunkIndex: Int) : PlaybackState
    data class Paused(val chunkIndex: Int) : PlaybackState
}

sealed interface PlaybackEvent {
    data object Play : PlaybackEvent
    data object Pause : PlaybackEvent
    data object Resume : PlaybackEvent
    data object Stop : PlaybackEvent
    data class ChunkDone(val chunkIndex: Int) : PlaybackEvent
    data object SpeedChanged : PlaybackEvent
    data object SpeechError : PlaybackEvent
}

sealed interface PlaybackEffect {
    data class Speak(val fromChunkIndex: Int) : PlaybackEffect
    data object StopSpeech : PlaybackEffect
}

data class Transition(val state: PlaybackState, val effect: PlaybackEffect?)

class ReaderPlayback(chunkCount: Int) {
    fun reduce(state: PlaybackState, event: PlaybackEvent): Transition
}
```

### Behavior rules — `SpeedPreset`

- Exactly five presets; their `rate` values are 1.0, 1.25, 1.5, 1.75, 2.0 and
  all distinct. `rate` maps directly to `TextToSpeech.setSpeechRate` (1.0 is
  the engine's normal rate); this enum is the single speed mapping.
- `DEFAULT` is `X1`.
- `fromName` restores a persisted preset: an exact enum-name match returns
  that preset; `null` or any unknown string returns `DEFAULT` (never throws).

### Behavior rules — `DocumentLoader`

- Decodes `bytes` as strict UTF-8. Malformed input fails with
  `INVALID_ENCODING` — no replacement characters.
- A leading UTF-8 BOM is stripped before validation.
- Decoded text containing U+0000 fails with `INVALID_ENCODING` (catches
  BOM-less UTF-16 and binary files that happen to decode).
- Empty input, BOM-only input, or text that is blank after decoding fails
  with `EMPTY`.
- On success the document's `name` is the provided name; a blank provided
  name falls back to `"Untitled"`.

### Behavior rules — `UtteranceChunker`

Chunks are the units handed to the TTS engine; every chunk must fit the
engine's per-utterance limit (`TextToSpeech.getMaxSpeechInputLength()`,
passed by the caller), and the current chunk is the pause/resume and
speed-change granularity.

- `maxChunkLength < 1` throws `IllegalArgumentException`.
- Blank text yields an empty list.
- The text splits at paragraph boundaries (one or more blank lines); a
  paragraph that fits the limit is one chunk.
- A paragraph over the limit splits at sentence boundaries (`.`, `!`, `?`,
  `…` followed by whitespace or end of text), packing consecutive whole
  sentences into each chunk up to the limit.
- A single sentence over the limit splits at the last whitespace before the
  limit; an unbroken run with no whitespace hard-splits at the limit.
- Every chunk is trimmed, non-blank, and no longer than `maxChunkLength`.
- Non-whitespace content is preserved exactly and in order across the chunk
  list; only whitespace at chunk boundaries may be dropped.

### Behavior rules — `ReaderPlayback`

Pure reducer, no dependencies; `:app` performs the returned effect
(`Speak(fromChunkIndex)` = flush the engine queue and enqueue chunks
`fromChunkIndex..last` at the currently selected rate; `StopSpeech` =
`TextToSpeech.stop()`; `null` = do nothing). The platform engine has no
pause, so Pause is implemented as stop-now, and Resume restarts from the
beginning of the chunk that was playing.

- `chunkCount < 1` throws `IllegalArgumentException` (the loader guarantees a
  non-empty document, so a valid reader always has at least one chunk).
- `last` below means `chunkCount - 1`.

State × event matrix — the source of truth. Each cell gives
`resulting state | effect`; `—` is an ignored event (state unchanged, no
effect).

| State ↓ Event → | Play | Pause | Resume | Stop | ChunkDone(i) | SpeedChanged | SpeechError |
|---|---|---|---|---|---|---|---|
| `Idle` | `Speaking(0)` \| `Speak(0)` | — | — | — | — (stale) | — | — (stale) |
| `Speaking(c)` | — | `Paused(c)` \| `StopSpeech` | — | `Idle` \| `StopSpeech` | see below | `Speaking(c)` \| `Speak(c)` | `Idle` \| `StopSpeech` |
| `Paused(c)` | `Speaking(c)` \| `Speak(c)` | — | `Speaking(c)` \| `Speak(c)` | `Idle` \| no effect | — (stale) | — (applies at resume) | — (stale) |

`ChunkDone(i)` in `Speaking(c)`:

- `i == c` and `c < last` → `Speaking(c + 1)` | no effect (the next chunk is
  already enqueued).
- `i == c == last` → `Idle` | no effect (document finished; position resets).
- `i != c` → ignored (stale or out-of-order engine callback).

Repeated-event policy: a repeat of the event that produced the current state
(`Play` in `Speaking`, `Pause` in `Paused`, `Resume` in `Speaking`) is an
ignored no-op. The one non-trivial repeat is `Play` in `Paused`, which acts
as `Resume` — the transport must never dead-end because the user tapped Play
instead of Resume.

`SpeedChanged` in `Speaking` restarts the current chunk at the new rate (the
engine applies rate per enqueued utterance, so a live change requires
re-enqueueing). In `Paused` and `Idle` it emits nothing; the new rate applies
at the next `Speak` effect.

### Behavior rules — app (`:app`)

- The app launches to an open screen with a single action that fires the
  system document picker (`Intent.ACTION_OPEN_DOCUMENT`, category
  `CATEGORY_OPENABLE`, type `*/*` with `EXTRA_MIME_TYPES` of
  `text/markdown`, `text/plain`, `application/octet-stream` — providers
  commonly report `.md`/`.markdown` as `text/markdown` or
  `application/octet-stream`; `DocumentLoader` validation is the real gate).
- Cancelling the picker stays on the open screen with no error.
- On a picked document the app reads the content bytes and the display name
  (`OpenableColumns.DISPLAY_NAME`; when unavailable, the URI's last path
  segment) and calls `DocumentLoader.load`.
- A read failure (`SecurityException`/`IOException`) shows a concise
  "can't read this file" error on the open screen. `Failed(EMPTY)` and
  `Failed(INVALID_ENCODING)` show concise per-error messages the same way.
  The reader is never entered on failure.
- On `Loaded` the app chunks the text with the engine's max input length and
  shows the reader screen: the document filename, Play, Pause/Resume, Stop,
  and the five speed presets from `SpeedPreset.entries` in declared order,
  with the selected one visible.
- Transport controls and engine callbacks (`UtteranceProgressListener`
  `onDone`/`onError`, mapped to `ChunkDone`/`SpeechError`) feed
  `ReaderPlayback.reduce`; the app executes returned effects on the engine
  and renders the returned state (Pause is shown while `Speaking`, Resume
  while `Paused`).
- `TextToSpeech` init failure and `SpeechError` transitions show a concise
  speech-failure error.
- The selected preset persists across launches (`SharedPreferences`, stored
  by enum name, restored via `SpeedPreset.fromName`).
- Leaving the reader (system back) stops speech and returns to the open
  screen.
- The manifest declares no permissions; document access rides the SAF grant.

### Tests (required)

`:core` unit tests, run by `gradle :core:test` (CI: `foliotell-android-core.yml`).

`SpeedPreset`:

- `test_presets_shouldExposeExactlyFiveDistinctRates`
- `test_presets_shouldMapToExpectedRates` (1.0, 1.25, 1.5, 1.75, 2.0)
- `test_presets_shouldExposeExpectedLabels` (1×, 1.25×, 1.5×, 1.75×, 2×)
- `test_default_shouldBeOneX`
- `test_fromName_shouldReturnPreset_onKnownName`
- `test_fromName_shouldReturnDefault_onUnknownName`
- `test_fromName_shouldReturnDefault_onNull`

`DocumentLoader`:

- `test_load_shouldReturnDocumentText_onValidUtf8`
- `test_load_shouldStripLeadingBom_onUtf8WithBom`
- `test_load_shouldFailEmpty_onEmptyBytes`
- `test_load_shouldFailEmpty_onWhitespaceOnlyText`
- `test_load_shouldFailEmpty_onBomOnlyBytes`
- `test_load_shouldFailInvalidEncoding_onMalformedUtf8`
- `test_load_shouldFailInvalidEncoding_onTextContainingNul`
- `test_load_shouldUseProvidedName_onValidDocument`
- `test_load_shouldFallBackToUntitled_onBlankName`

`UtteranceChunker`:

- `test_chunk_shouldThrow_onNonPositiveLimit`
- `test_chunk_shouldReturnEmptyList_onBlankText`
- `test_chunk_shouldReturnSingleChunk_onParagraphWithinLimit`
- `test_chunk_shouldSplitAtParagraphBoundaries_onMultipleParagraphs`
- `test_chunk_shouldPackWholeSentencesUpToLimit_onOversizedParagraph`
- `test_chunk_shouldSplitAtLastWhitespaceBeforeLimit_onOversizedSentence`
- `test_chunk_shouldHardSplitAtLimit_onUnbrokenRunOverLimit`
- `test_chunk_shouldTrimChunks_onWhitespaceAroundParagraphs`
- `test_chunk_shouldKeepEveryChunkWithinLimit_onMixedDocument`
- `test_chunk_shouldPreserveNonWhitespaceContentInOrder_onMixedDocument`

`ReaderPlayback` — mechanical projection of the matrix: paired
state/effect tests per covered cell, single tests for non-trivial ignored
cells (stale-callback guards and repeated-event policy); trivial no-op cells
(`Pause`/`Resume`/`Stop`/`SpeedChanged` in `Idle`, repeats that re-issue the
current state's own event) are covered by the matrix, not rote-tested. The
reducer has no dependencies — there are no calls to verify on initialization
and no spies to specify.

- `test_init_shouldThrow_onNonPositiveChunkCount`
- `test_play_shouldTransitionToSpeakingChunkZero_onIdle`
- `test_play_shouldEmitSpeakFromChunkZero_onIdle`
- `test_pause_shouldTransitionToPausedAtCurrentChunk_onSpeaking`
- `test_pause_shouldEmitStopSpeech_onSpeaking`
- `test_stop_shouldTransitionToIdle_onSpeaking`
- `test_stop_shouldEmitStopSpeech_onSpeaking`
- `test_chunkDone_shouldAdvanceToNextChunk_onSpeakingNonLastChunk`
- `test_chunkDone_shouldEmitNoEffect_onSpeakingNonLastChunk`
- `test_chunkDone_shouldTransitionToIdle_onSpeakingLastChunk`
- `test_chunkDone_shouldEmitNoEffect_onSpeakingLastChunk`
- `test_chunkDone_shouldBeIgnored_onSpeakingWithMismatchedIndex`
- `test_chunkDone_shouldBeIgnored_onIdle`
- `test_chunkDone_shouldBeIgnored_onPaused`
- `test_speedChanged_shouldStaySpeakingAtCurrentChunk_onSpeaking`
- `test_speedChanged_shouldEmitSpeakFromCurrentChunk_onSpeaking`
- `test_speedChanged_shouldBeIgnored_onPaused`
- `test_speechError_shouldTransitionToIdle_onSpeaking`
- `test_speechError_shouldEmitStopSpeech_onSpeaking`
- `test_speechError_shouldBeIgnored_onIdle`
- `test_speechError_shouldBeIgnored_onPaused`
- `test_resume_shouldTransitionToSpeakingAtPausedChunk_onPaused`
- `test_resume_shouldEmitSpeakFromPausedChunk_onPaused`
- `test_play_shouldActAsResume_onPaused`
- `test_play_shouldEmitSpeakFromPausedChunk_onPaused`
- `test_stop_shouldTransitionToIdle_onPaused`
- `test_stop_shouldEmitNoEffect_onPaused`
- `test_play_shouldBeIgnored_onSpeaking`
- `test_resume_shouldBeIgnored_onSpeaking`

Manual acceptance (emulator and at least one physical device; the Android
analog of the iOS acceptance criteria):

- App launches to the open screen; the picker opens and a `.md` file can be
  picked.
- Opening a valid document presents the reader with its filename.
- Playback, pause, resume, and stop work; pause/resume resumes within the
  document (current chunk), not from the top.
- All five speed presets audibly differ; changing speed mid-playback takes
  effect.
- The selected speed survives an app relaunch.
- Empty, non-UTF-8, and unreadable files each show a concise error and stay
  on the open screen.
- System back from the reader stops speech and returns to the open screen.
- Airplane mode changes nothing.

### Done criteria

- `:core` implements the public interface above; every enumerated unit test
  exists and is green in `foliotell-android-core.yml`.
- `:app` implements the app behavior rules; `:app:assembleDebug` is green in
  CI and the debug-APK build commands are documented.
- Manual acceptance passes on an emulator and at least one physical device.
