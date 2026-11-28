# Summary jobs replacement QA

## S-1 Replace notes jobs

Drive: Seed the old and new jobs, including a reused identity, and compare the resulting notes and their inputs.

Evidence: Missing.

## S-2 Reuse assigned names

Drive: Run fresh and recovered split jobs and compare the notes with
their saved labels. Merge a call with an unnamed remote speaker and
verify the enabled identification step runs.

Evidence: `SplitCompositionTests.stagedPartJobsUseOnlyTheirSavedNamedEntries`
and `aMergedUnnamedSpeakerGoesThroughEnabledIdentification`.

## S-3 Honor notes admission

Drive: Verify both forms of rejection against the same admission rule used for ended calls.

Evidence: Missing.
