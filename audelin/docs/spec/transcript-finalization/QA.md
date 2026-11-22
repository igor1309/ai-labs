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

## S-1 Saved call is diarized after its speaker evidence closes

Closing a saved transcript leaves it waiting. Evidence: `TranscriptFinalizationReducerTests.closingASavedCallWaitsForEvidence_state`, `_effect`.

The diarizer port receives the closed speaker evidence and empty finishing outcomes. Evidence: `TranscriptFinalizationReducerTests.callsAreIndependent_effect`, `TranscriptFinalizationEffectHandlerTests.diarizeDeliversTheAttributedFarSide`.

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
At shutdown, both cleanups stop before any replacement. Complete A's
replacement while B's remains held: A finalizes, publishes and releases its
resources; B remains committing and shutdown stays unsettled. Evidence:
`TranscriptFinalizationEffectHandlerTests.shutdownStopsEachCleanupThenDeliversEachCompletedCommit`;
`TranscriptFinalizationPortsTests.shutdownPublishesAndReleasesOneCallWhileAnotherReplacementIsHeld`.

## S-11 Late results change nothing

Evidence: `TranscriptFinalizationReducerTests.outOfStageEventsAreIgnored_state`, `_effect`; `TranscriptFinalizationShutdownTests.lateCleanupIsIgnored_state`, `_effect`, `repeatedShutdownIsIgnored_state`, `_effect`.

## S-21 A split not kept still cleans

The diarizer port returns with no saved split: cleanup is called on the far
side as written, and the commit tells the split as not kept. Evidence: `TranscriptFinalizationOutcomesTests.noSavedSplitIsNotKept_state`, `_effect`; `TranscriptFinalizationEffectHandlerTests.finishingCommitCarriesOutcomesAndWaitsForReplacement` with names saved and no split.
