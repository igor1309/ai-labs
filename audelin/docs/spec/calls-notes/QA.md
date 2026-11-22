# Calls, notes — QA

Tested for real in a temporary calls folder.

## S-1 A call with two notes versions is one call

Drive: a call fixture with both versions written by SummaryFiles; list;
read back one entry. Evidence: `NotesVersionsTests.bothVersionsMoveAndRemainOneCallWithItsTranscript`.

## S-2 A call's transcript without its notes

Drive: same fixture; read the transcript; compare with the fixture
transcript. Evidence: `NotesVersionsTests.bothVersionsMoveAndRemainOneCallWithItsTranscript`
and `CallsTextTests.ignoresNotesAndHandsTheTranscriptToItsReader`.
