# Split sheet QA

## S-1 Choose a boundary and names

Drive: Render representative states and check that both defaults carry the app label, edit each title independently, and check the confirmed values on both list rows.

Evidence: `SplitCallPreviewTests.drawsTheSplitFrame`, `RecordingsSplitTests.theDraftUsesTheAppLabelAndRechecksIdlenessOnConfirm` and `live-calls-split.sh`.

## S-2 Wait for the confirmed split

Drive: Render the working state and check the accessible confirm control stays unavailable during a second submit attempt.

Evidence: `SplitCallPreviewTests.drawsTheSplitFrame` (splitting) and `RecordingsSplitTests.publishesBothPartsAndSelectsTheFirstOnlyAfterACompleteList`.

## S-3 See why the split failed

Drive: Render the failure state and check the error, selected boundary and both edited values in preview and accessibility output.

Evidence: `SplitCallPreviewTests.drawsTheSplitFrame` (failed) and `RecordingsSplitTests.failuresKeepTheDraftAndExpiryRequiresAChoiceFromTheNewTranscript`.
