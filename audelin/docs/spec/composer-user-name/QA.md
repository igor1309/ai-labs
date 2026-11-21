# Composer, the user's name — QA

Composer tests build the real composer on a temp folder with a fake runtime
that records each request, a fake account-name binding and a preferences
file holding the Zoom name.

## S-1 The Zoom name wins

Evidence: `UserNameWiringTests.theZoomNameWins`.

## S-2 The Mac account's name without a Zoom name

Evidence: `UserNameWiringTests.theAccountNameWithoutAZoomName`.

## S-3 No name at all

Evidence: `UserNameWiringTests.noNameAtAll`.

## S-4 The user's lines are marked

Drive: finalize a transcript with both sides; read the recorded notes
request. Evidence: `UserNameWiringTests.onlyTheUsersLinesAreNamed`.

## S-5 Speaker identification reads the named lines

Evidence: `UserNameWiringTests.speakerRequestReadsTheNamedLines`.

## S-6 The transcript file is unchanged

Drive: after notes are made, read `transcript.md` from the temp folder.
Evidence: `UserNameWiringTests.theTranscriptFileKeepsTheSideLabel`.

## S-7 An attempt saved before this change

Drive: put an attempt with a snapshot in the previous encoding in the temp
calls folder; start the composer. Evidence:
`UserNameWiringTests.anOldSnapshotResumesWithNoName`.
