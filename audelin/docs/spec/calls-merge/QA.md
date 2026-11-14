# Calls — merging calls — QA

Adapter tests on a temporary calls folder through the real file system,
with tracks of known length; failures and interruptions come from the
injected disk binding failing a chosen step. Evidence: Missing for every
row.

## S-1 A merged call takes its parts' place

Merge A and B (A earlier, titled): listing gives one call with A's id,
title and start; A and B are not listed.

## S-2 The parts are kept whole

Every file inside the merged call's A and B folders has the bytes it had.

## S-3 A merged call reads as one

The merged call's text gives the joined transcript's lines and no line
only a part had.

## S-4 A merged call's duration spans its parts

A at 10:00 with 8 min tracks, B at 10:10 with 5 min tracks: duration
15 min. With B's tracks unreadable: no duration, still listed.

## S-5 A merge being prepared is not listed

With the final rename held back: listing gives A and B only.

## S-6 A failed merge leaves the parts

Fail the rename of B into the prepared folder after A moved: A and B list
at their places with their files, no prepared folder is left, and the
error names the step.

## S-7 An interrupted merge is put back

Leave a recorded merge with A moved in, as a crash would: the next listing
lists A and B and leaves no prepared folder. With the final rename done,
the merged call stays.

## S-8 A merged call is deleted with its parts

Delete the merged call: the Trash binding is given its folder, parts
inside.

## S-9 A merged call moves with its parts

Move the merged call: the target holds it with A and B inside, and listing
the target gives one call.
