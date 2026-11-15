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

## S-2 Failed write is final as last saved

Evidence: `TranscriptFinalizationReducerTests.writeFailureMarksLatestWrite_state`, `closingAfterAFailedWriteIsFinalAsSaved_state`, `_effect`, `failedWriteEntriesAreTheLastSavedText`.

## S-3 Call with no write is final and empty

Evidence: `TranscriptFinalizationReducerTests.closingWithoutAWriteIsFinalAndEmpty_state`, `_effect`, `noSavedTextMakesNoEntries`, `emptyEntriesAreNotUsable`.

## S-4 Diarized call is cleaned

Evidence: `TranscriptFinalizationReducerTests.diarizedFarSideIsCleaned_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.cleanDeliversTheHeardMicrophoneSide`.

## S-5 Failed diarization still cleans

Evidence: `TranscriptFinalizationReducerTests.failedDiarizationCleansTheWrittenText_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.failedDiarizationDeliversNoFarSide`.

## S-6 Heard microphone side is committed

Evidence: `TranscriptFinalizationReducerTests.heardMicrophoneIsCommitted_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.commitDeliversSuccessOnceReplaced`.

## S-7 Kept microphone side is final

Evidence: `TranscriptFinalizationReducerTests.keptMicrophoneIsFinal_state`, `_effect`, `keptMicrophoneEntriesTakeTheFarSide`; `TranscriptFinalizationEffectHandlerTests.keptMicrophoneDeliversNothingHeard`.

## S-8 Committed cleanup is final

Evidence: `TranscriptFinalizationReducerTests.committedCleanupIsFinal_state`, `_effect`, `committedEntriesTakeTheHeardSide`; `TranscriptFinalizationEffectHandlerTests.publishHandsEveryFinalOverAndDeliversPublished`.

## S-9 Failed commit is final as written

Evidence: `TranscriptFinalizationReducerTests.failedCommitIsFinalAsWritten_state`, `_effect`, `failedCommitEntriesKeepTheWrittenSide`; `TranscriptFinalizationEffectHandlerTests.failedReplacementDeliversFailure`.

## S-10 Calls are made final independently

Evidence: `TranscriptFinalizationReducerTests.callsAreIndependent_state`, `_effect`.

## S-11 Late results change nothing

Evidence: `TranscriptFinalizationReducerTests.outOfStageEventsAreIgnored_state`, `_effect`; `TranscriptFinalizationShutdownTests.lateCleanupIsIgnored_state`, `_effect`, `repeatedShutdownIsIgnored_state`, `_effect`.

## S-12 Shutdown after input ended with nothing open settles at once

Evidence: `TranscriptFinalizationShutdownTests.shutdownWithNoWorkIsSettled_state`, `_effect`.

## S-13 Shutdown stops cleaning

Evidence: `TranscriptFinalizationShutdownTests.cleaningCallIsFinalAsWritten_state`, `_effect`, `shutdownSettlesEveryCleaningCallAtOnce`; `TranscriptFinalizationEffectHandlerTests.stopCleaningStopsEachCallsCleanupThenPublishes`.

## S-14 Shutdown lets diarizing finish its write

Evidence: `TranscriptFinalizationShutdownTests.diarizedAfterShutdownIsFinalWithoutCleaning_state`, `_effect`.

## S-15 Call closing after shutdown skips model work

Evidence: `TranscriptFinalizationShutdownTests.closedAfterShutdownIsFinalWithoutDiarizing_state`, `_effect`.

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
`closedAfterShutdownIsFinalWithoutDiarizing_state`, `_effect`,
`publishedCallStillWaitsForInputToEnd_state`, `_effect` in the shutdown reducer tests.

Composition coverage quits a recording with saved text while the injected
diarizer would wait at entry, checks it was never entered, checks the published
final transcript and file contain the last saved text, and observes publication
before termination. Quit during transcript opening also holds termination until
the late opening closes and its final transcript is taken. The subscription
maps every transcript event in order and sends input ended after the last close.
