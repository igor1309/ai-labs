# Make each recorded transcript final — shutdown QA

The rows for [SHUTDOWN.md](SHUTDOWN.md), built and run as [QA.md](QA.md) says.
Unqualified test names are in `TranscriptFinalizationShutdownTests`.

## S-12 Shutdown after input ended with nothing open settles at once

Evidence: `TranscriptFinalizationShutdownTests.shutdownWithNoWorkIsSettled_state`, `_effect`.

## S-13 Shutdown stops cleaning

Evidence: `TranscriptFinalizationShutdownTests.cleaningCallCommitsAsWritten_state`, `_effect`, `shutdownCommitsEveryCleaningCall`; `TranscriptFinalizationEffectHandlerTests.stopCleaningStopsEachCallThenPublishesEachCompletedCommit`.

With the split saved, cleanup held and shutdown sent: the stop spy is called, the commit tells the saved split and cleaning skipped, and the receiver spy gets the final transcript only after the commit returns. Evidence: `TranscriptFinalizationEffectHandlerTests.stopCleaningStopsEachCallThenPublishesEachCompletedCommit`; `TranscriptFinalizationOutcomesTests.stoppedCommitPublishesIndependently_state`, `_effect`; `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork` at cleaning.

## S-14 Shutdown lets diarizing finish its write

Evidence: `TranscriptFinalizationShutdownTests.diarizedAfterShutdownCommitsWithoutCleaning_state`, `_effect`.

Shutdown while the diarizer is held, then released with Nemotron: one commit with that split and cleaning skipped, then publication. Evidence: `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork` at diarizing.

## S-15 Call closing after shutdown skips model work

Evidence: `TranscriptFinalizationShutdownTests.closedAfterShutdownCommitsWithoutDiarizing_state`, `_effect`.

A saved call closing after shutdown: no diarizer call, one commit with both stages skipped, then publication; a call whose latest write failed: no commit. Evidence: `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork` at writing, `failedLatestWritePublishesEarlierWordsWithoutACommit` after shutdown; `TranscriptFinalizationOutcomesTests.failedLatestWriteAfterShutdownNeverCommits_state`, `_effect`.

## S-16 Settled waits for every publication

Evidence: `TranscriptFinalizationShutdownTests.writingCallHoldsSettling_state`, `publicationOfOneCallLeavesAnotherUnsettled`, `publishedCallsSettle_state`, `_effect`.

## S-17 Shutdown lets a commit finish its write

Evidence: `TranscriptFinalizationShutdownTests.committedAfterShutdownIsFinal_state`, `_effect`.

## S-18 Input ends before shutdown

Input ended records that no more openings, writes or closes can arrive. It
starts no work and cannot settle without shutdown, even when no call is open
or all calls are published. Evidence: `inputEndedBeforeShutdownDoesNotSettle_state`,
`_effect`, `shutdownWithNoWorkIsSettled_state`, `_effect`,
`publishedCallsSettle_state`, `_effect`.

## S-19 Shutdown arrives before input ends

Shutdown forbids new model work immediately. Settled still waits for input to
end and every opened call's final publication, in either order. Evidence:
`shutdownWaitsForInputToEnd_state`, `_effect`,
`inputEndedAfterShutdownSettlesPublishedCalls_state`, `_effect`,
`inputEndedWaitsForPublication_state`, `_effect`,
`publishedCallStillWaitsForInputToEnd_state`, `_effect`,
`publicationSettles_state`, `_effect`, `repeatedInputEndedIsIgnored_state`,
`_effect`.

## S-20 A call opens after shutdown while input is still open

An opening and saved write after shutdown remain accepted until input ends.
Closing publishes the last saved text without diarizing or cleaning; settled
requires both input ended and publication. Evidence:
`callCanOpenAndSaveAfterShutdown_state`, `_effect`,
`closedAfterShutdownCommitsWithoutDiarizing_state`, `_effect`,
`publishedCallStillWaitsForInputToEnd_state`, `_effect`.

Composition coverage quits a recording with saved text while the injected
diarizer would wait at entry, checks it was never entered, checks the published
final transcript and file contain the last saved text, and observes publication
before termination. Quit during transcript opening also holds termination until
the late opening closes and its final transcript is taken. The subscription
maps every transcript event in order and sends input ended after the last close.

The late call's commit tells both stages skipped; with its latest write failed, none is asked. Evidence: `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork` at opening after shutdown, `failedLatestWritePublishesEarlierWordsWithoutACommit` after shutdown.
