# Transcript origin — QA

Recording and finishing rows drive the app's composition with fake
recognisers, cleanup and diarizer ports that pick each outcome, on a temp
calls folder, and read the saved transcript file back: the words and
speaker labels as well as the origin. Merge and notes rows extend the live
calls scripts with fixture calls whose front matter names distinct versions.

## S-1 A transcript tells who heard each side

Read the file at the first in-call save: the bundle's version and build,
and the recogniser identity the drive supplied for each side. Evidence: `TranscriptOriginCompositionTests.liveWriteTellsTheSuppliedBuildAndBothRecognisers`.

## S-2 A transcript being finished tells what is saved so far

Diarization answers and its write lands; cleanup is held. Read the file:
hearing and the split told with version and build, cleaning untold.
Evidence: `TranscriptOriginCompositionTests.savedSplitTellsItsDiarizerWhileCleanupIsHeld`.

## S-3 A cleaned microphone side tells it

Cleanup answers with heard words: the microphone side holds them and the
origin says done, with version and build. Evidence: `TranscriptOriginCompositionTests.savedSplitTellsItsDiarizerWhileCleanupIsHeld`, once cleanup is released.

## S-4 A microphone side with nothing cleaned tells it

Two runs: cleanup finds no echo, and cleanup reaches its gate and fails.
Each time the microphone side is the raw text and the origin says nothing
kept, with version and build. Evidence: `TranscriptOriginCompositionTests.cleanupWithNoEchoKeepsRawWords`, `cleanupKeepingNothingCommitsRawWordsAndItsOutcome`.

## S-5 A stage skipped at quit tells it

Shutdown at each boundary the finalization contract names: before the
transcript closes (split and cleaning skipped), while splitting (split
done, cleaning skipped), while cleaning (cleaning skipped, an earlier split
kept), while the cleaned words are written (cleaning done). Each reads the
saved text and the outcomes, with version and build. Evidence: `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork`, at writing, opening after shutdown, diarizing, cleaning and committing.

## S-6 Their side split by speaker tells the diarizer

Diarization answers two speakers by Nemotron, and in a second run by the VBx
fallback: the labels split and the origin names that diarizer, version and
build. Evidence: `TranscriptOriginCompositionTests.savedSplitTellsItsDiarizerWhileCleanupIsHeld`, with Nemotron and with VBx.

## S-7 Their side not split tells it

Diarization fails: their side is unsplit and the origin says nothing kept,
with version and build. Evidence: `TranscriptOriginCompositionTests.failedSplitKeepsTheirSideUnsplitAndTellsNothingKept`.

## S-13 A failed save keeps the text and its origin together

The transcript file's replacing write fails after cleanup answers: the
file holds the earlier words and the earlier origin, with no cleaning done.
Evidence: `TranscriptOriginCompositionTests.failedCleanupReplacementKeepsEarlierTextAndOriginTogether`.

## S-8 A merged call tells each call's origin

`scripts/live-calls-merge.sh`, extended with two parts naming different
versions: each origin by its start, in order, and the built app's version
as merger. Evidence: `scripts/live/calls-merge.swift` `merging`; `MergeChainTests.remergeKeepsOriginalOriginsAndExpandsLegacyOriginalStarts`.

## S-9 Merging a merged call lists its original calls

The same script merges that result with a third call, and merges a seeded
merge made without origins with another call: the full ordered list of
start and origin pairs, distinct versions where known, unknown elsewhere. Evidence: `scripts/live/calls-merge.swift` `remergeWithLegacyCall`, `legacyMergeOrigins`; `MergeChainTests.remergeKeepsOriginalOriginsAndExpandsLegacyOriginalStarts`.

## S-10 A call without origin reads as unknown in a merge

The same script with one part without front matter: that call reads
unknown, the other its origin. Evidence: `scripts/live/calls-merge.swift` `remergeWithLegacyCall`, with D telling no origin.

## S-11 A transcript without origin reads as before

A seeded call without front matter and with saved notes, opened through
accessibility: its transcript and notes read. Evidence: `scripts/live/calls-summary.swift` `legacyTranscriptAndNotesRemainReadable`.

## S-12 Notes leave the origin out

`scripts/live-calls-summary.sh` on a call with distinct spoken and origin
markers: the captured request holds the spoken marker only, and the fixture
response echoes the transcript it got, so the saved notes do too.
Evidence: `scripts/live/calls-summary.swift` `steps`, the completed run; `SummaryCompositionTests.notesRequestCarriesTheWordsWithoutTheOrigin`.
