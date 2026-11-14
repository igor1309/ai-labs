# Merging calls — QA

Each row is a live test: the built app, idle, on a temp calls folder of
fixture calls cut from one recorded call plus an unrelated call between
them, driven through the accessibility API by element identifier, reading
back what the app shows and what is on disk.

## S-1 Merging neighbouring calls

In merge mode, select two neighbouring parts and confirm. The list holds
one call in their place, with the earliest part's title and start; its
transcript holds both parts' entries in order with the gap between them;
its notes are made from the whole transcript; the parts' audio files are
byte for byte as they were. Evidence: `scripts/live-calls-merge.sh`, first launch: the later part's row goes,
the merged folder holds both parts and a transcript with both parts' text in
order, and every `call.caf` is byte for byte as written. Notes from the whole
transcript: `MergeChainTests` and
`SummariesModelTests.S15_aMergedCallsNotesAreMadeFromItsJoinedTranscript()`;
the live app runs with notes off.

## S-2 Merging calls far apart asks again

Select two parts with the unrelated call between them and confirm: the
warning shows. Going back leaves the selection and the calls unchanged;
merging anyway merges them as in S-1. Evidence: `scripts/live-calls-merge.sh`, first launch: the warning
shows, Back leaves the marks and the calls, Merge anyway merges.

## S-3 A merge that fails

With writing the merged transcript failing, both parts list and read as
before and the failure reads why. Evidence: `scripts/live-calls-merge.sh`, second launch, with the
calls folder read-only: the failure line shows, both parts list and stay on
disk as they were.
