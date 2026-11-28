# Calls split QA

## S-1 Publish both parts

Drive: Use temporary folders, inspect the published list and compare staged contents, including the notes jobs.

Evidence: Missing.

## S-2 Fail before commit

Drive: Inject a preparation or commit-marker failure and compare the original
folder and listing. Submit an overlong title for each part and reopen the
folder to verify the original remains readable.

Evidence: `CallsFolderSplitTests.failureBeforeTheDecisionLeavesTheOriginalByteForByte`
and `aRejectedDestinationNameLeavesTheOriginalReadable`.

## S-3 Recover before commit

Drive: Start with an interrupted transaction fixture and inspect the recovered listing and original files.

Evidence: Missing.

## S-4 Recover after commit

Drive: Interrupt after publishing part 1 and recover twice. Compare both
parts' transcripts, notes jobs, recording starts, tracks and attachments
with an uninterrupted split, including the tracks intentionally absent.

Evidence: `CallsFolderSplitTests.recoversBothPartsAfterOnlyOneWasPublished`.

## S-5 Restore relocated recordings

Drive: Seed staged source children and recover twice. Compare every original recording and the visible list.

Evidence: Missing.
