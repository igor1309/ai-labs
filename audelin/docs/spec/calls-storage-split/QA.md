# Calls storage split QA

## S-1 Reject inactive folder

Drive: Exercise an inactive root and a pending move, and inspect the failure and unchanged listings.

Evidence: Missing.

## S-2 Reject changed transcript

Drive: Replace the transcript between choice read and confirmation and verify the replacement is still visible.

Evidence: Missing.

## S-3 Resolve both parts

Drive: Verify lookup and list after a successful split and again after reopening storage.

Evidence: Missing.

## S-4 Keep same-minute parts addressable

Drive: Split with another folder in the same minute and check both resulting IDs can be resolved and merged.

Evidence: Missing.

## S-5 Recover identities after publication

Drive: Restore a committed fixture with a stale storage journal and compare lookup and listing after two restores.

Evidence: Missing.

## Folder admission and journal recovery

Drive: Attempt a recording claim inside the track cutter, then allocate
a recording in the same minute after publication. Interrupt a split after
part 1 and verify recording allocation is refused until recovery. Queue
a split behind a storage turn, then grant a recording claim before
releasing the turn.
Attempt a split after a legacy journal fails to migrate, and try again
once the retained folder returns and recovery has loaded the journal.

Evidence: `CallsStorageSplitTests.aRecordingCannotAllocateTheSecondPartsIdentityDuringTheCut`,
`aRecordingCannotAllocateAnUnpublishedPartIdentityAfterInterruptedPublication`,
`recordingCanWinAdmissionWhileSplitWaitsForTheStorageTurn` and
`CallsStorageTests.unavailableLegacyRootDoesNotReplaceItsJournal`.
