# Split composition QA

## S-1 Prepare both parts on the cut clock

Drive: Split fixture data through the composed ports and reopen both outputs using the existing readers.

Evidence: Missing.

## S-2 Merge the split parts back

Drive: Split and merge a fixture whose cut differs from the displayed minute and compare row times.

Evidence: Missing.

## S-3 Recover notes after a split

Drive: Interrupt publication after part 1, reopen through fresh calls
storage and run both recovered pending jobs. Compare the notes and their
transcript identities with the respective parts. Reopen and merge a part
with named and unattributed speech and verify both labels survive.

Evidence: `SplitCompositionTests.stagedPartJobsUseOnlyTheirSavedNamedEntries`.

## S-4 Keep the clock across an audio gap

Drive: Use nested recording folders and a cut whose exact timeline start differs from the folder minute. Compare row times and the per-recording audio positions.

Evidence: Missing.

## S-5 Keep the cut visible after merging

Drive: Merge a split with no missing audio between the two parts and check that the rendered transcript retains the boundary marker.

Evidence: Missing.

## An eligible notes job cannot be written

Drive: Fail the pending record's write during each transaction and compare
the original folder contents and listing.

Evidence: `SplitCompositionTests.anEligibleNotesWriteFailureKeepsOriginalFoldersIntact`.
