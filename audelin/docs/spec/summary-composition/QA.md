# Coordinate notes and recording — QA

Executable boundary checks below use synthetic transcripts and controlled providers.
The fixture/oracle prose describes the broader scenario; a boundary pass does not
claim OCR of every production status or semantic accuracy of model output.
Ordering probes use handshakes, never sleeps. Full validation: `audelin/scripts/gate-step.sh`.

## S-1 Wait for final write

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/waitForFinalWriteThenPublishAndShowStatus`. Setup fixture: the final transcript write is held; drive: call end arrives; read-back oracle: I cannot dispatch notes until the successful write and close finish. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-2 Accept recovered write

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/latestWriteOverridesEarlierOutcome`. Setup fixture: an earlier write failed but the latest final write succeeds; drive: the transcript closes; read-back oracle: I can dispatch notes for its actual spoken entries. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-3 Reject stale saved text

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/latestWriteOverridesEarlierOutcome`. Setup fixture: the final write failed after an older write succeeded; drive: the transcript closes; read-back oracle: I cannot dispatch notes from the stale file. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-4 Start another call

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/nextCallStartsWhilePreviousGenerationIsHeldAndQuitJoinsCancellation`. Setup fixture: an earlier summary request is held; drive: another call begins; read-back oracle: I can start recording without waiting for generation. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-5 Quit joins cleanup

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/nextCallStartsWhilePreviousGenerationIsHeldAndQuitJoinsCancellation`. Setup fixture: a generation request is active; drive: the app quits; read-back oracle: I can terminate after cancellation cleanup without fallback. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-6 Quit during handoff

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryCompositionTests/quitDuringHeldFinalWritePersistsPendingBeforeTermination`. Setup fixture: recording is ending when quit stops dispatch; drive: final text becomes eligible; read-back oracle: I can retain pending work without beginning a request during shutdown. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-7 Complete during folder move

Automated boundary: `cd audelin/macos/App && swift test --filter SummaryStorageTests/productionRenameDeleteAndPartialMoveCoordinatePublication`. Setup fixture: a calls-folder move is copying a call; drive: notes finish; read-back oracle: I can read one complete result in the moved call. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-8 Update during asynchronous dispatch

`cd audelin/macos && swift test --filter 'SummariesBusyTests|SummariesShutdownTests'` checks which stages hold an update: every stage from reading the transcript through the last save, a retry, a discard and a job another instance runs. A waiting, pending or settled call lets the update go ahead. Stopping dispatch sends an unanswered start back to pending, which starts no request.

## S-9 Another instance retries an interrupted call

`cd audelin/macos/App && swift test --filter SummariesSharedFilesTests` runs two compositions over the same calls folder. One loads the interrupted call and retries it while the request is held; the other, with or without a refused retry first, follows the retry on refresh, reports work in progress until the last save, then shows the notes. Only one request is made. The reducer tests check that a reload cannot replace a call this instance retried meanwhile.

## S-10 Completion cannot be established

A refresh that cannot read the call, or reads an unknown phase or a corrupt record, leaves it as another instance's work, so the update stays held; a reread that finds the job ended releases it. A call whose record is gone is dropped. A pending job another instance stored lets the update go ahead and is read again on the next refresh.

## S-11 Retry after an earlier error

`cd audelin/macos && swift test --filter SummariesRetryTests` retries a failed or interrupted call whose earlier retry failed. The retry clears that mark when it starts; a retry that fails again restores the call's stage and marks it. Each call keeps its own mark, so a retry of one call leaves another's as it was.

## S-12 Make on request with automatic notes off

`swift test --filter CallNotesWiringTests/requestedNotesWorkWithAutomaticNotesOff` in the App package drives both row and detail requests over a temporary calls folder with automatic notes off. Controlled generation receives the saved transcript and configured model; the detail carries the generated text and the notes file's formatted modification date. `CallsSplitTests` checks button forwarding and the rendered date mapping.

## S-13 Cancel only the requested attempt

`swift test --filter CallNotesWiringTests/cancelDiscardsOnlyThatAttemptAndAllowsMakingAgain` holds two requests, cancels one through the detail, reads no notes or job record for it, and keeps the other job running. Making again then quitting retains both current attempts as interrupted. `failureShowsItsReasonAndRetryMakesAgain` proves failure text and a successful saved-attempt retry.

`transcriptReadFailureCanBeRetriedBeforeAJobExists` uses an unreadable transcript in a temporary calls folder, checks the failure offers retry without a job record, restores readable text and retries through the detail. Generation runs once and the detail receives the notes. `unreadableJobRecordRetryReportsTheStorageFailure` keeps a corrupt stored record and reports the retry refusal.

## S-14 Call end starts the call's notes machine

`swift test --filter CallNotesWiringTests/callEndShowsMakingThenTheNotes` ends a recorded call with automatic notes on and controlled generation held. The selected detail shows making, then the published notes after release.

## S-15 A merge replaces every part's notes job

Parts A pending and B done, merged as A: both jobs are dropped, the fake
runtime never gets A's own transcript, and the one request for A holds
both parts' text. Evidence: Missing.
