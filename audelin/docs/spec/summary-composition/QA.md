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

`cd audelin/macos/App && swift test --filter 'SummaryCoordinatorTests|SummaryProtectionTests'` holds the dispatch acknowledgment and terminal save separately. The coordinator stays busy until acknowledgment; the job stays busy until saving completes. A withdrawn approval leaves pending work and starts no request.

## S-9 Another instance retries an interrupted call

`cd audelin/macos/App && swift test --filter SummaryArbitrationTests` loads the same interrupted call through recovery or a competing submission in two compositions, holds the owner's retry request, and refreshes the observer with and without a refused retry first. The observer reports active work until terminal saving. Held successful and failed refresh reads cannot overwrite a locally retried job.

## S-10 Completion cannot be established

The observer cases cover running and lost-dispatch states against a read error, absence, a corrupt snapshot and an unknown phase. Every unresolved read keeps protection; a terminal reread releases it. A confirmed pending observer allows updates and continues watching for another owner's dispatch.

## S-11 Retry after an earlier error

`cd audelin/macos/App && swift test --filter SummaryCoordinatorTests` starts retry with failures for the requested call and another call. Both successful and failed results clear the requested call's old error at retry start, preserving the unrelated error.
