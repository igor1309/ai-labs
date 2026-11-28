# Calls split QA

## S-1 Publish both parts

Drive: Use temporary folders, inspect the published list and compare staged contents, including the notes jobs.

Evidence: Missing.

## S-2 Fail before commit

Drive: Inject a failure after preparation and compare the original's files and the visible listing.

Evidence: Missing.

## S-3 Recover before commit

Drive: Start with an interrupted transaction fixture and inspect the recovered listing and original files.

Evidence: Missing.

## S-4 Recover after commit

Drive: Open an interrupted committed transaction and recover twice. Compare both parts and confirm the original is absent.

Evidence: Missing.

## S-5 Restore relocated recordings

Drive: Seed staged source children and recover twice. Compare every original recording and the visible list.

Evidence: Missing.
