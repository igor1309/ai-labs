# Make each recorded transcript final — QA

TranscriptFinalization is a state machine with no adapter: reducer rows
build a given state with `makeState`/`makeCall` and assert the next state
and the effect for the same state and event; effect handler rows drive spies
of its four ports (diarizing, microphone cleanup, transcript replacement,
final transcripts) and read the event each effect delivers. Entries come from
an injected pure mapping whose spy rows are `TranscriptFinalizationReducerTests`'s
entries tests. Build with `swift build --build-tests`, then run
`../scripts/swift-test-bounded.sh 120 --filter TranscriptFinalizationTests`
from `audelin/macos` with `GITHUB_ACTIONS=1`.

## S-1 Saved call is diarized after it closes

Evidence: `TranscriptFinalizationReducerTests.closingASavedCallDiarizes_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.diarizeDeliversTheAttributedFarSide`.

The diarizer port's spy gets no finishing outcome. Evidence: `TranscriptFinalizationEffectHandlerTests.diarizeDeliversTheAttributedFarSide`, `TranscriptFinalizationReducerTests.closingASavedCallDiarizes_effect`.

## S-2 Failed write is final as last saved

Evidence: `TranscriptFinalizationReducerTests.writeFailureMarksLatestWrite_state`, `closingAfterAFailedWriteIsFinalAsSaved_state`, `_effect`, `failedWriteEntriesAreTheLastSavedText`.

After an earlier saved write with its origin, the latest write fails: the receiver spy gets the earlier text and no replacement is asked. Evidence: `TranscriptOriginCompositionTests.failedLatestWritePublishesEarlierWordsWithoutACommit`.

## S-3 Call with no write is final and empty

Evidence: `TranscriptFinalizationReducerTests.closingWithoutAWriteIsFinalAndEmpty_state`, `_effect`, `noSavedTextMakesNoEntries`, `emptyEntriesAreNotUsable`.

## S-4 Diarized call is cleaned

Evidence: `TranscriptFinalizationReducerTests.diarizedFarSideIsCleaned_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.cleanDeliversTheHeardMicrophoneSide`.

The diarizer port reports Nemotron, then in a second run VBx: the cleanup commit the replacement spy gets tells the split by that diarizer. Evidence: `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with Nemotron and with VBx; `TranscriptFinalizationOutcomesTests.savedDiarizerIsKept_state`, `_effect`.

## S-5 Failed diarization still cleans

Evidence: `TranscriptFinalizationReducerTests.failedDiarizationCleansTheWrittenText_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.failedDiarizationDeliversNoFarSide`.

The commit the replacement spy gets tells the split as not kept. Evidence: `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with a failed diarization; `TranscriptFinalizationOutcomesTests.noSavedSplitIsNotKept_state`, `_effect`.

## S-6 Heard microphone side is committed

Evidence: `TranscriptFinalizationReducerTests.heardMicrophoneIsCommitted_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.commitDeliversSuccessOnceReplaced`.

## S-7 Kept microphone side is final

Evidence: `TranscriptFinalizationReducerTests.keptMicrophoneIsFinal_state`, `_effect`, `keptMicrophoneEntriesTakeTheFarSide`; `TranscriptFinalizationEffectHandlerTests.keptMicrophoneDeliversNothingHeard`.

The replacement spy gets one commit of the text as written, cleaning told as nothing kept; the receiver spy gets nothing until it returns. Evidence: `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with nothing heard; `TranscriptFinalizationOutcomesTests.cleanupCommitsTheSplitAndItsOutcome_state`, `_effect`.

## S-8 Committed cleanup is final

Evidence: `TranscriptFinalizationReducerTests.committedCleanupIsFinal_state`, `_effect`, `committedEntriesTakeTheHeardSide`; `TranscriptFinalizationEffectHandlerTests.publishHandsEveryFinalOverAndDeliversPublished`.

The replacement spy's commit tells cleaning as cleaned; held, the receiver spy gets nothing, released, the final transcript. Evidence: `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with heard words; `TranscriptFinalizationOutcomesTests.cleanupCommitsTheSplitAndItsOutcome_state`, `_effect`.

## S-9 Failed commit is final as written

Evidence: `TranscriptFinalizationReducerTests.failedCommitIsFinalAsWritten_state`, `_effect`, `failedCommitEntriesKeepTheWrittenSide`; `TranscriptFinalizationEffectHandlerTests.failedReplacementDeliversFailure`.

The replacement fails: the receiver spy gets the earlier words, and the replacement spy is asked no second write; the file keeping the earlier origin is the transcript format and file's, read back in the user spec's failed-save row. Evidence: `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with the replacement failing.

## S-10 Calls are made final independently

Evidence: `TranscriptFinalizationReducerTests.callsAreIndependent_state`, `_effect`.

## S-11 Late results change nothing

Evidence: `TranscriptFinalizationReducerTests.outOfStageEventsAreIgnored_state`, `_effect`; `TranscriptFinalizationShutdownTests.lateCleanupIsIgnored_state`, `_effect`, `repeatedShutdownIsIgnored_state`, `_effect`.

## S-12 Shutdown after input ended with nothing open settles at once

Evidence: `TranscriptFinalizationShutdownTests.shutdownWithNoWorkIsSettled_state`, `_effect`.

## S-13 Shutdown stops cleaning

Evidence: `TranscriptFinalizationShutdownTests.cleaningCallCommitsAsWritten_state`, `_effect`, `shutdownCommitsEveryCleaningCall`; `TranscriptFinalizationEffectHandlerTests.stopCleaningStopsEachCallThenCommits`.

With the split saved, cleanup held and shutdown sent: the stop spy is called, the commit tells the saved split and cleaning skipped, and the receiver spy gets the final transcript only after the commit returns. Evidence: `TranscriptFinalizationEffectHandlerTests.stopCleaningStopsEachCallThenCommits`; `TranscriptFinalizationOutcomesTests.stoppedCommitsPublishTogether_state`, `_effect`; `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork` at cleaning.

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
`publishedCallsSettle_state`, `_effect` in the shutdown reducer tests.

## S-19 Shutdown arrives before input ends

Shutdown forbids new model work immediately. Settled still waits for input to
end and every opened call's final publication, in either order. Evidence:
`shutdownWaitsForInputToEnd_state`, `_effect`,
`inputEndedAfterShutdownSettlesPublishedCalls_state`, `_effect`,
`inputEndedWaitsForPublication_state`, `_effect`,
`publishedCallStillWaitsForInputToEnd_state`, `_effect`,
`publicationSettles_state`, `_effect`, `repeatedInputEndedIsIgnored_state`,
`_effect` in the shutdown reducer tests.

## S-20 A call opens after shutdown while input is still open

An opening and saved write after shutdown remain accepted until input ends.
Closing publishes the last saved text without diarizing or cleaning; settled
requires both input ended and publication. Evidence:
`callCanOpenAndSaveAfterShutdown_state`, `_effect`,
`closedAfterShutdownCommitsWithoutDiarizing_state`, `_effect`,
`publishedCallStillWaitsForInputToEnd_state`, `_effect` in the shutdown reducer tests.

Composition coverage quits a recording with saved text while the injected
diarizer would wait at entry, checks it was never entered, checks the published
final transcript and file contain the last saved text, and observes publication
before termination. Quit during transcript opening also holds termination until
the late opening closes and its final transcript is taken. The subscription
maps every transcript event in order and sends input ended after the last close.

The late call's commit tells both stages skipped; with its latest write failed, none is asked. Evidence: `TranscriptOriginCompositionTests.quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork` at opening after shutdown, `failedLatestWritePublishesEarlierWordsWithoutACommit` after shutdown.

## S-21 A split not kept still cleans

The diarizer port returns with no saved split: cleanup is called on the far
side as written, and the commit tells the split as not kept. Evidence: `TranscriptFinalizationOutcomesTests.noSavedSplitIsNotKept_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with names saved and no split.
