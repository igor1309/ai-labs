# Make each recorded transcript final — QA

TranscriptFinalization is a state machine with no adapter: reducer rows
build a given state with `makeState`/`makeCall` and assert the next state
and the effect for the same state and event; effect handler rows drive spies
of its four ports (diarizing, microphone cleanup, transcript replacement,
final transcripts) and read the event each effect delivers. Entries come from
an injected pure mapping whose spy rows are `TranscriptFinalizationReducerTests`'s entries tests. Run:
`cd audelin/macos && swift test --filter TranscriptFinalizationTests`.

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

## S-12 Shutdown with nothing open settles at once

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
