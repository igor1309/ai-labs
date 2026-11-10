# Keep notes and job records durably — QA

Executable boundary checks below use synthetic transcripts and controlled providers.
The fixture/oracle prose describes the broader scenario; a boundary pass does not
claim OCR of every production status or semantic accuracy of model output.
Ordering probes use handshakes, never sleeps. Full validation: `audelin/scripts/gate-step.sh`.

## S-1 Persist a claim

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/exclusiveClaimAndRunningSaveArbitrateAcrossInstances`. Setup fixture: a call has no job; drive: I claim it twice; read-back oracle: I can retrieve one durable pending job. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-2 Reload progress

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/corruptRecordIsNotAbsentAndPendingSurvivesRestart`. Setup fixture: a claimed job changes progress; drive: I reload it; read-back oracle: I can retrieve the saved phase and sanitized error. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-3 Publish notes atomically

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/publicationReceiptRecoversExactJobAndInputAfterTerminalSaveFailure`. Setup fixture: a call has a transcript; drive: I save notes; read-back oracle: I can read complete notes beside the unchanged transcript. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-4 Preserve files on write failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/failedReplacementKeepsPreviousCompleteNotes`. Setup fixture: a complete summary already exists; drive: replacing it fails; read-back oracle: I can read the previous complete notes with no partial replacement. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-5 Reconcile interrupted status

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/publicationReceiptRecoversExactJobAndInputAfterTerminalSaveFailure`. Setup fixture: summary output committed before a status-write failure; drive: I reload the job; read-back oracle: I can retrieve success without requesting generation. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-6 Follow a renamed call

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/renameFollowsIdentityAndDeleteDoesNotRecreateFolder`. Setup fixture: a claimed call folder is renamed; drive: I finish saving notes; read-back oracle: I can read the notes in the current call folder. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-7 Report missing call

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/renameFollowsIdentityAndDeleteDoesNotRecreateFolder`. Setup fixture: a call is removed during generation; drive: I save the result; read-back oracle: I receive a failure without recreating the deleted call. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-8 Concurrent claim has one owner

Automated boundaries: `cd audelin/macos && swift test --filter SummaryFilesTests/exclusiveClaimAndRunningSaveArbitrateAcrossInstances` and `swift test --filter SummaryIndependentOwnerTests`. The latter holds the durable start write while an independent storage owner attempts to start; its Locations share no mutex. Setup fixture: two submissions target the same unclaimed call; drive: both try to claim it; read-back oracle: only one can dispatch while the other observes its job. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-9 Unreadable record is not absence

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/corruptRecordIsNotAbsentAndPendingSurvivesRestart`. Setup fixture: a previous job record is unreadable; drive: I claim the call; read-back oracle: I receive a recovery failure without permission to dispatch. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-10 Old notes do not complete a new job

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/mismatchedReceiptNeverCompletesNewRunningClaim`. Setup fixture: existing notes belong to another job; drive: I recover the current job; read-back oracle: I cannot mistake the old notes for current success. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-11 Move a partially moved call

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryStorageTests/productionRenameDeleteAndPartialMoveCoordinatePublication`. Setup fixture: a calls-folder move has partially completed; drive: notes finish for an already moved call; read-back oracle: I can read the complete notes in its current folder without recreating the source. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-12 Failed progress save

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/durableWriteFailuresAreVisible`. Setup fixture: a job is claimed; drive: saving running progress fails; read-back oracle: I receive a storage failure without permission to request generation. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-13 Reject mismatched input receipt

Automated boundary: `cd audelin/macos && swift test --filter SummaryFilesTests/mismatchedReceiptNeverCompletesNewRunningClaim`. Setup fixture: existing output names the current job but another input; drive: I recover the current job; read-back oracle: I cannot mistake that output for current success. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-16 A replacement recording cannot receive an old job's work

For each of claim, load, start, progress and publish, replace a claimed recording's folder
at the same path. Test different UUIDs, a UUID replaced by no identity and a legacy recording
replaced by a UUID. Each old operation fails as call-not-found and leaves the replacement's
entries and identity bytes unchanged, with or without an active ownership lease. Evidence: `reusedFolderRejectsEveryOldJobOperation`.
Loading a copied stale record also fails without changing its bytes.
Evidence: `loadRejectsARecordCopiedFromAnotherRecording`.
Both matching UUIDs and legacy folders/jobs without UUIDs complete the full job lifecycle.
Evidence: `matchingRecordingAndLegacyJobsComplete`.
Independent coordinator submissions and dispatches retain each recording's UUID, and a new
recording can claim a job after deletion of its predecessor.
Evidence: `sameMinuteRecordingsHaveIndependentSubmissionsAndDispatches` and
`replacementRecordingClaimsItsOwnJobAndRecoveryKeepsItsIdentity`.
