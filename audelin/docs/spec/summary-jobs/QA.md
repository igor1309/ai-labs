# Produce notes independently of recording — QA

Executable boundary checks below use synthetic transcripts and controlled providers.
The fixture/oracle prose describes the broader scenario; a boundary pass does not
claim OCR of every production status or semantic accuracy of model output.
Ordering probes use handshakes, never sleeps. Full validation: `audelin/scripts/gate-step.sh`.

## S-1 Disabled job

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/ineligibleNeverClaims`. Setup fixture: summaries are disabled; drive: a final transcript is offered; read-back oracle: I can finish without requesting runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-2 Wait for final text

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/latestWriteAndCloseDecideEligibility`. Setup fixture: a transcript is still being finalized; drive: an end notification arrives; read-back oracle: I can observe waiting without a runtime request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-3 Reject unusable text

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/ineligibleNeverClaims`. Setup fixture: final text contains no spoken entries; drive: completion is offered; read-back oracle: I can observe a reason notes are unavailable without a runtime request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-4 Make notes

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/successPersistsBeforeRequestsAndCheckpointsBeforeNotes`. Setup fixture: eligible final text and settings are captured; drive: a runtime returns notes; read-back oracle: I can read the complete notes and successful completion. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-5 Fall back per failed step

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryGenerationTests/fallbackIncludesDomainValidationAndDoesNotRepeatIdentification`. Setup fixture: a primary step fails; drive: fallback succeeds; read-back oracle: I can retrieve the fallback step result. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-6 Record exhausted notes failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/exhaustedIdentificationWarnsAndNotesFailureIsPersisted`. Setup fixture: both notes attempts fail; drive: the job finishes; read-back oracle: I can retrieve a sanitized failure without losing the transcript. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-7 Continue after identification failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/exhaustedIdentificationWarnsAndNotesFailureIsPersisted`. Setup fixture: both identification attempts fail; drive: notes succeed using original labels; read-back oracle: I can retrieve notes with a speaker warning. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-8 Keep successful identification

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryGenerationTests/fallbackIncludesDomainValidationAndDoesNotRepeatIdentification`. Setup fixture: speaker evidence has been accepted; drive: primary notes fail and fallback succeeds; read-back oracle: I can retrieve notes using those names without another identification request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-9 Deduplicate completion

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/cancellationAndObserversCannotReplay`. Setup fixture: a call already has a claimed job; drive: its completion arrives again; read-back oracle: I can observe the same job without additional runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-11 Reload safely

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryStorageTests/pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay`. Setup fixture: a claimed job was running when the app exited; drive: jobs are loaded; read-back oracle: I can observe interruption without automatic runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-12 Resume pending work

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryStorageTests/pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay`. Setup fixture: a persisted job never started runtime work; drive: jobs are loaded; read-back oracle: I can resume that job using its saved configuration. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-13 Report output failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/storageFailuresStopThePipeline`. Setup fixture: notes are generated; drive: saving them fails; read-back oracle: I can observe failure without publishing partial notes. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-14 Cancel cleanly

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryGenerationTests/cancellationNeverCallsFallback`. Setup fixture: a runtime request is active; drive: the job is cancelled; read-back oracle: I can await its end with no fallback request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-15 Reject failed final text

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/latestWriteAndCloseDecideEligibility`. Setup fixture: the latest final write failed; drive: completion is offered; read-back oracle: I can read why notes are unavailable without a runtime request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-16 Do not dispatch after storage failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/storageFailuresStopThePipeline`. Setup fixture: the running claim cannot be saved; drive: dispatch is attempted; read-back oracle: I can read the storage failure without runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-17 Observe pending work

Automated boundary: `cd audelin/macos && swift test --filter SummaryJobsTests/successPersistsBeforeRequestsAndCheckpointsBeforeNotes`. Setup fixture: a claimed eligible job is held before dispatch; drive: I inspect progress; read-back oracle: I can distinguish waiting from an active request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

Prompt evidence: `cd audelin/macos/App && swift test --filter SummaryGenerationTests/adversarialTranscriptRemainsDataAndPromptDoesNotPromiseSemanticProof`; structured Russian/English fixtures check required sections and localized empty decisions/actions.
