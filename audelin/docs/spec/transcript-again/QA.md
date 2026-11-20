# Re-recognition — QA

The evidence combines the live driver over temporary calls, app-composition
and production-port tests, and component tests for pure rules. The live
rehearsal holds model acquisition, hearing, finishing and publication at
filesystem handshakes. Each preservation assertion compares both transcript
files byte for byte; relaunch uses the same fixture without reseeding.
The ports fixtures include bleed, split speakers and call-app names.

## S-1 Preparing

Hold model loading: the call shows preparing; cancel, and the files are unchanged.
Evidence: `live-calls-transcript-again.sh`, `cancel-preparing` and `quit-preparing`: model acquisition is held before hearing.

## S-2 Hearing

Hold hearing midway: progress shows and advances when released; the old transcript opens from the folder; cancel is enabled.
Evidence: `live-calls-transcript-again.sh`, `cancel-hearing`: the hearing progress and cancel control are accessible while the saved pair remains readable. `ReRecognitionTests.fractionsOnlyRiseAcrossBothTracks` proves progress ordering.

## S-3 Finishing

Hold finishing during cleaning, and in a second run just before the swap: the call shows finishing, the old transcript opens, and cancelling leaves the files unchanged.
Evidence: `live-calls-transcript-again.sh`, `cancel-finishing` and `cancel-publishing`; `ReRecognitionTests.stoppingPublishesNothing` holds cleanup itself; `TranscriptAgainCompositionTests.cancellationWhilePublishWaitsForStorageReportsStopped` and `CallsPreviousTranscriptTests.cancellationAfterWritingBeforeTheFirstMoveKeepsThePair` cover the pre-commit boundary.

## S-4 The new transcript replaces the old

Release all: the file holds newly heard words, no bleed on the microphone side, their side split, the call-app name on the matching speaker, and this build's origin.
Evidence: `TranscriptAgainPortsTests.splitAndCleanRebuildTheCallInSpeakerTurns` reads the published words, speaker turns, cleanup result and complete origin; `TranscriptAgainCompositionTests.remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes` checks the carried call-app name through the app.

## S-5 Finishing that keeps nothing

A fixture with no bleed: the file holds the heard words and tells cleaning kept nothing; the old transcript is now previous.
Evidence: `TranscriptAgainPortsTests.eachOriginalIsHeardWholeInOrderAndPlacedAtItsOffset` keeps the microphone words when cleanup keeps nothing; `live-calls-transcript-again.sh` reads the published fixture sides and the previous bytes.

## S-6 An ambiguous name stays unnamed

Three fixtures: a name overlapping two new speakers equally, unequally with neither mostly its own, and two names mostly on one new speaker: those speakers read unnamed. A one-to-one fixture keeps its name (S-4).
Evidence: `TranscriptAgainPortsTests.ambiguousOldNamesStayUnnamedInThePublishedTranscript` reads the published transcript for all three ambiguity fixtures; `ReRecognitionTests.realNameCarryLeavesAmbiguousSpeakersUnnamed`; `NameCarryTests.evenSplitCarriesNothing`, `unevenSplitCarriesOnlyTheMutualMajority` and `twoNamesOnOneSpeakerCarryNothing` exercise the ambiguity rules. The composed name port is exercised by `TranscriptAgainCompositionTests.remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes`.

## S-7 Cancelling keeps the transcript

Cancel at each held wait in turn: files unchanged, no error shown.
Evidence: `live-calls-transcript-again.sh`, `cancel-preparing`, `cancel-hearing`, `cancel-finishing` and `cancel-publishing`: the pair stays byte-identical, the wait ends and no error banner appears.

## S-8 Hearing fails

An undecodable track: the reason shows, files unchanged; restore the track, retry, and the run completes.
Evidence: `live-calls-transcript-again.sh`, `failure-track`: corrupts the track after discovery during held preparation, checks the original-call reason and unchanged pair, repairs the track and retries to publication. `TranscriptAgainCompositionTests.failuresTravelThroughTheChain` checks hearing failures through the actual chain.

## S-9 Saving fails

Fail the swap after the new file is written: the reason shows, files unchanged; retry completes.
Evidence: `live-calls-transcript-again.sh`, `failure-swap`: fails after the first real move, checks the unchanged pair and retries to publication. `TranscriptAgainCompositionTests.failuresTravelThroughTheChain` checks the terminal publishing report.

## S-10 Quitting keeps the transcript

Quit at each held wait, and kill the app during the swap, then relaunch: the pair is wholly old or wholly new, nothing is being made, and no stray files are in the folder.
Evidence: `live-calls-transcript-again.sh`, `quit-preparing`, `quit-hearing`, `quit-finishing`, `quit-publishing`, `kill-publish` and `kill-restore`: requests application Quit or kills after the first move, relaunches without reseeding, checks a whole pair, no run and no recovery files.

## S-11 A recording starting stops it

Start a recording during hearing, automatically and in a second run by hand: it records, files unchanged, and the call reads that making again stopped.
Evidence: `TranscriptAgainRecordingStartTests.aRecordingStartStopsTheRunAndKeepsTheOldTranscript`, for both automatic and manual recording inputs, through the full app composition.

## S-12 A merged call is made again by its original calls

A merge of a merge of three fixture calls: each original call named by its start, once, in order, with new words, each gap marked, a new origin per call and the merging version.
Evidence: `TranscriptAgainCompositionTests.nestedOriginalsKeepTheirOffsetsAndListingMetadata`: checks all three original starts, new words, gaps, every original's complete hearing/split/cleaning origin, merging version and unchanged archived originals.

## S-13 A failed original call keeps the merged transcript

The same merge with one undecodable call: files unchanged, that call and the reason show; fix it, retry, and the run completes.
Evidence: `TranscriptAgainCompositionTests.aFailedNestedOriginalKeepsThePairAndCanBeRepairedForRetry` corrupts a nested original, checks the unchanged merged pair and failed original, repairs the track and retries through the app. `TranscriptAgainCompositionTests.failuresTravelThroughTheChain`, merged hearing case, names the later failing original. `live-calls-transcript-again.sh`, `failure-track`, proves repair/retry and byte preservation; `ReRecognitionTests.aMergedCallNamesTheFailingOriginal` checks both tracks.

## S-14 The speech models fail to load

Make model loading fail: the reason shows, files unchanged; let loading succeed, retry, and the run completes.
Evidence: `live-calls-transcript-again.sh`, `failure-loading`: the injected model-acquisition description reaches the banner, both files stay unchanged and retry publishes. `TranscriptAgainCompositionTests.failuresTravelThroughTheChain` checks loading errors through the actual chain.
