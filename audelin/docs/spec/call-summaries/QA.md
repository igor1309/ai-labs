# Optional call notes — QA

Executable boundary checks below use synthetic transcripts and controlled providers.
The fixture/oracle prose describes the broader scenario; a boundary pass does not
claim OCR of every production status or semantic accuracy of model output.
Ordering probes use handshakes, never sleeps. Full validation: `audelin/scripts/gate-step.sh`.

## S-1 No notes without permission

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/defaultOffFinishesTheCallWithoutClaimingOrRequestingNotes`. Setup fixture: I have not enabled call summaries; drive: a call finishes; read-back oracle: I keep the transcript without sending it to a summary provider. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-2 Choose where notes are made

Automated boundaries: `cd audelin/macos/App && swift test --filter SummarySettingsRoutingTests` and `swift test --filter SummarySettingsPresentationTests/bothSlotsDiscloseRecipientsAndCostsIncludingRemoteFallback`. Setup fixture: I open Settings; drive: I enable summaries and save my runtime choices; read-back oracle: I can see the primary, fallback, models, cost and transcript recipients. Edit distinct CLI primary/model and API fallback/model/recipient, save, reload and OCR each disclosure.

## S-3 Wait for the last words

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/waitForFinalWriteThenPublishAndShowStatus`. Setup fixture: summaries are enabled and recognition is finishing; drive: I open the ended call; read-back oracle: I can read that notes wait for the final transcript. Hold the latest final write; inspect waiting while invocation count is zero, then release.

## S-4 See notes being made

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/nextCallStartsWhilePreviousGenerationIsHeldAndQuitJoinsCancellation`. Setup fixture: the final transcript is ready; drive: notes begin; read-back oracle: I can read that notes are being prepared while another call can record. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-5 Read faithful notes

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryGenerationTests/structuredLanguageFixturesHaveAllRequiredSections`. Setup fixture: a call has a final transcript; drive: notes finish; read-back oracle: I can read structured notes in the meeting language beside the unchanged transcript. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-6 Keep unknown speakers

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/unknownSpeakerIsValidWithoutInventedName`. Setup fixture: speaker identification is enabled; drive: the transcript does not establish a speaker name; read-back oracle: I can read notes retaining that speaker label. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-7 Use the fallback

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryGenerationTests/fallbackIncludesDomainValidationAndDoesNotRepeatIdentification`. Setup fixture: the primary runtime cannot complete a step; drive: the fallback completes it; read-back oracle: I can read the resulting notes. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-8 Keep a call when notes fail

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/exhaustedAttemptsKeepTheCallAndExposeFailureOrSpeakerWarning`. Setup fixture: both runtimes fail to make notes; drive: I open the call; read-back oracle: I can read the failure and still use the transcript and recording. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-9 Avoid misleading notes

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/ineligibleNeverClaims`. Setup fixture: the final transcript is empty; drive: the call finishes; read-back oracle: I can see why notes were not generated. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-10 Keep failed text separate

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/latestWriteOverridesEarlierOutcome`. Setup fixture: transcript finalization fails; drive: the call finishes; read-back oracle: I can see notes are unavailable without losing the text already saved. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-11 Read after restarting

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryStorageTests/pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay`. Setup fixture: notes were being requested when the app exited; drive: I reopen Audelin; read-back oracle: I can see interruption without being charged for an automatic repeat. Reload a durable running claim; inspect interruption and zero adapter invocations.

## S-12 Read after a file failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/failedReplacementKeepsPreviousCompleteNotes`. Setup fixture: notes cannot be saved; drive: I open the call; read-back oracle: I can see the save failure and still use the transcript. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-13 Read a speaker warning

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/exhaustedAttemptsKeepTheCallAndExposeFailureOrSpeakerWarning`. Setup fixture: identification failed but notes succeeded; drive: I open the call; read-back oracle: I can read the notes and the speaker warning. Both identification attempts fail; notes return with original labels; OCR notes and speaker warning.

## S-14 Read storage failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/storageFailuresStopThePipeline`. Setup fixture: initial job ownership cannot be saved; drive: I open the call; read-back oracle: I can read why notes cannot proceed and still open the transcript. Fail initial exclusive-claim creation; inspect failure and zero invocations.

## S-15 Read recovery failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/corruptRecordIsNotAbsentAndPendingSurvivesRestart`. Setup fixture: a previous job record cannot be read; drive: I reopen Audelin; read-back oracle: I can read the recovery failure without an automatic generation request. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-16 Read progress saving failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/storageFailuresStopThePipeline`. Setup fixture: running job progress cannot be saved; drive: I open the call; read-back oracle: I can read the storage failure and still open the transcript. Fail the running-state write after a pending claim; inspect failure and zero invocations.

## S-17 Read waiting notes

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/successPersistsBeforeRequestsAndCheckpointsBeforeNotes`. Setup fixture: eligible notes are durably pending and dispatch is held; drive: I open the call; read-back oracle: I can read that notes are waiting to start. Hold dispatch after successful finalization and pending persistence; OCR waiting and count zero invocations.

## S-18 Read reloaded waiting notes

Automated boundaries: `cd audelin/macos/App && swift test --filter SummaryStorageTests/pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay` and `swift test --filter SummaryRecoveryDispatchTests`. The dispatch proof asserts the exact saved configuration and transcript request, once. Setup fixture: a never-started pending job is loaded after restart; drive: dispatch remains held; read-back oracle: I can read that notes are waiting to start. Reload a durable pending record with dispatch held; OCR waiting and count zero invocations.

Rendered per-call waiting, running, success, warning, failure and interruption statuses in both appearances: `cd audelin/macos && swift test --filter CallsListViewRenderTests/eachCallShowsItsOwnSummaryProgressAndOutcome`. Accepted speaker evidence checkpoint/read-back and notes payload: `cd audelin/macos/App && swift test --filter SummaryAcceptedEvidenceTests`.

## S-19 Explicitly retry interrupted notes

`cd audelin/macos/App && swift test --filter SummaryRecoveryDispatchTests` verifies no automatic replay of interrupted work, followed by one explicit request with the saved transcript, runtime, model and optional fallback. Current preferences and changed transcript bytes do not replace the saved request.

## S-20 Refused or failed retry

`cd audelin/macos/App && swift test --filter SummaryCompositionTests/callsListRetriesOnlyOnRequestAndShowsRetryErrors` checks the visible retry error and preserved transcript and notes. Active and completed attempts refuse another retry.

## S-21 Read retry completion in the open window

`cd audelin/macos/App && swift test --filter SummaryCompositionTests/retryCompletionRefreshesTheOpenCallsWindowAndPreview` holds generation with and without previous notes. Completion makes the new notes text readable while the calls window stays open and listing IDs stay unchanged.
