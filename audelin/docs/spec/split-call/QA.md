# Splitting a call QA

Drive the scenarios with fixture recordings in an isolated profile. Verify the successful split and merge-back on a real call before release.

## S-1 Seeing where to cut

Drive: Open the sheet on a fixture call and compare order and the two visible entries for each choice.

Evidence: Missing.

## S-2 Splitting at a chosen gap

Drive: Split a fixture with both audio tracks and tags. Reopen both parts and compare their titles, text, speakers, audio and tags.

Evidence: Missing.

## S-3 New notes for each part

Drive: Enable notes in a fixture profile and verify that each new result uses only its own transcript.

Evidence: Missing.

## S-4 A call with nothing to split

Drive: Select a call with one transcript entry and check split availability.

Evidence: Missing.

## S-5 Splitting while Audelin is busy

Drive: Hold a fixture notes job while attempting split, then finish the job and check that the action becomes available.

Evidence: Missing.

## S-6 Going back without splitting

Drive: Cancel after editing both titles and compare the original call and its files.

Evidence: Missing.

## S-7 A split that fails

Drive: Inject a precommit write failure and confirm the sheet shows the cause and the original is still readable.

Evidence: Missing.

## S-8 A split cut short by quitting

Drive: Interrupt before and after commitment and reopen the fixture. Compare the visible calls and their complete files.

Evidence: Missing.

## S-10 Checking split availability

Drive: Hold the read for the selected call and inspect the control until the choices arrive.

Evidence: Missing.

## S-11 Failing to read split choices

Drive: Fail the selected transcript read and inspect the availability reason.

Evidence: Missing.

## S-12 A call outside the active folder

Drive: Select a fixture call in an inactive folder and inspect the availability reason.

Evidence: Missing.

## S-13 Splitting is in progress

Drive: Hold publication, inspect progress and attempt a second confirmation. Resume publication and inspect both parts.

Evidence: Missing.

## S-9 Undoing a split

Drive: Confirm a split, merge the two parts, and inspect the marker and the restored transcript timeline.

Evidence: Missing.
