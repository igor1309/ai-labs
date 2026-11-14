# Calls — merging calls — QA

Adapter tests on a temporary calls folder through the real file system,
with tracks of known length; failures and interruptions come from the
injected disk binding failing a chosen step. A row without evidence is
Missing.

## S-1 A merged call takes its parts' place

Merge A and B (A earlier, titled): listing gives one call with A's id,
title and start; A and B are not listed. Evidence:
`CallsMergeTests.S1_S2_aMergedCallTakesItsPartsPlaceAndKeepsThemWhole()`.

## S-2 The parts are kept whole

Every file inside the merged call's A and B folders has the bytes it had.
Evidence: `CallsMergeTests.S1_S2_aMergedCallTakesItsPartsPlaceAndKeepsThemWhole()`.

## S-3 A merged call reads as one

The merged call's text gives the joined transcript's lines and no line
only a part had. Evidence: `CallsMergeTests.S3_aMergedCallReadsAsOne()`.

## S-4 A merged call's duration spans its parts

A at 10:00 with 8 min tracks, B at 10:10 with 5 min tracks: 15 min. A at
10:00 with 20 min tracks, B at 10:10 with 5 min: 20 min. A merged call
merged again with C: its span reaches the nested parts' latest end.
A part whose length cannot be read leaves the span unknown. Evidence:
`CallsMergeTests.S4_aMergedCallsDurationSpansItsParts()`,
`aLaterPartEndingLastSetsTheSpan()`, `aMergedPartsPartsCount()` and
`aPartWithoutAKnownLengthLeavesTheSpanUnknown()`; a merged call's own
listing is in `S1_onlyTopLevelCallsAreListed()`.

## S-5 A merge being prepared is not listed

A listing taken while the joined transcript is being written does not show
the prepared folder, and the merge then goes on and the merged call lists.
Evidence: `CallsMergeTests.S5_theFolderBeingPreparedIsNotListed()`.

## S-6 A failed merge leaves the parts

Fail the rename of B into the prepared folder after A moved: A and B list
at their places with their files, no prepared folder is left, and the
error names the step. A failed transcript write leaves them too.
Evidence: `CallsMergeTests.S6_aMergeFailingAfterAPartMovedLeavesTheParts()`
and `aMergeFailingToWriteTheTranscriptLeavesTheParts()`.

## S-7 An interrupted merge is put back

Leave a recorded merge with A moved in, as a crash would, and start a new
Calls: its first listing gives A and B and no prepared folder is left.
With the final rename done, the merged call stays. A merge interrupted
before any part moved leaves only the parts. Evidence:
`CallsMergeTests.S7_anInterruptedMergeIsPutBack()`,
`aMergeInPlaceStaysWhenCallsStarts()` and
`anInterruptedMergeBeforeAnyPartMovedLeavesNothing()`. The app's storage puts it
back as it restores, before its first listing:
`CallsStorageMergeTests.restoringPutsBackAMergeInterruptedBeforeItWasInPlace()`.

## S-8 A merged call is deleted with its parts

Delete the merged call: the Trash binding is given its folder, parts
inside. Evidence: `CallsMergeTests.S8_aMergedCallIsDeletedWithItsParts()`.

## S-9 A merged call moves with its parts

Move the merged call: the target holds it with A and B inside, and listing
the target gives one call. Evidence:
`CallsMergeTests.S9_aMergedCallMovesWithItsParts()`.

## S-10 A part without a known length is not merged

Merge A and B with B's tracks unreadable: the error names B, and every
file is where it was; nothing is written. Evidence:
`CallsMergeTests.S10_aPartWithoutAKnownLengthIsNotMerged()`.

## S-11 Each part's transcript is read whole

A part's transcript with named speakers, a gap and filled-in text reads
back byte for byte (Evidence:
`CallsMergeTests.S11_eachPartsTranscriptIsReadAsWritten()`); with B's
unreadable the error names B and every file is where it was (Evidence:
`CallsMergeTests.S11_anUnreadableTranscriptNamesItsCall()`).
