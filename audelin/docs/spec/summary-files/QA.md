# Keep notes and job records durably — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.

## S-1 Persist a claim

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/persistaclaim`. Setup fixture: a call has no job; drive: I claim it twice; read-back oracle: I can retrieve one durable pending job. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-2 Reload progress

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/reloadprogress`. Setup fixture: a claimed job changes progress; drive: I reload it; read-back oracle: I can retrieve the saved phase and sanitized error. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-3 Publish notes atomically

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/publishnotesatomically`. Setup fixture: a call has a transcript; drive: I save notes; read-back oracle: I can read complete notes beside the unchanged transcript. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-4 Preserve files on write failure

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/preservefilesonwritefailure`. Setup fixture: a complete summary already exists; drive: replacing it fails; read-back oracle: I can read the previous complete notes with no partial replacement. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-5 Reconcile interrupted status

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/reconcileinterruptedstatus`. Setup fixture: summary output committed before a status-write failure; drive: I reload the job; read-back oracle: I can retrieve success without requesting generation. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-6 Follow a renamed call

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/followarenamedcall`. Setup fixture: a claimed call folder is renamed; drive: I finish saving notes; read-back oracle: I can read the notes in the current call folder. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-7 Report missing call

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/reportmissingcall`. Setup fixture: a call is removed during generation; drive: I save the result; read-back oracle: I receive a failure without recreating the deleted call. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-8 Concurrent claim has one owner

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/concurrentclaimhasoneowner`. Setup fixture: two submissions target the same unclaimed call; drive: both try to claim it; read-back oracle: only one can dispatch while the other observes its job. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-9 Unreadable record is not absence

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/unreadablerecordisnotabsence`. Setup fixture: a previous job record is unreadable; drive: I claim the call; read-back oracle: I receive a recovery failure without permission to dispatch. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-10 Old notes do not complete a new job

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/oldnotesdonotcompleteanewjob`. Setup fixture: existing notes belong to another job; drive: I recover the current job; read-back oracle: I cannot mistake the old notes for current success. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-11 Move a partially moved call

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/moveapartiallymovedcall`. Setup fixture: a calls-folder move has partially completed; drive: notes finish for an already moved call; read-back oracle: I can read the complete notes in its current folder without recreating the source. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-12 Failed progress save

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/failedprogresssave`. Setup fixture: a job is claimed; drive: saving running progress fails; read-back oracle: I receive a storage failure without permission to request generation. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.

## S-13 Reject mismatched input receipt

Missing — planned `cd audelin/macos && swift test --filter SummaryFilesTests/rejectmismatchedinputreceipt`. Setup fixture: existing output names the current job but another input; drive: I recover the current job; read-back oracle: I cannot mistake that output for current success. Use temporary call folders and job/input receipts; inject failure at the named claim/progress/publication/read/move operation and inspect on-disk bytes.
