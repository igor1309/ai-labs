# Recordings split QA

## S-1 Keep choices with the selected transcript

Drive: Drive selection, transcript identity and reversed choice responses through reducer and handler tests.

Evidence: `RecordingsSplitTests.lateAnswersAndAnswersForAReplacedTranscriptAreIgnored`.

## S-2 Recheck eligibility

Drive: Drive idle availability to busy before confirmation and check the failure presentation and absence of a split effect.

Evidence: `RecordingsSplitTests.theDraftUsesTheAppLabelAndRechecksIdlenessOnConfirm`.

## S-3 Show successful replacement

Drive: Complete the fake split and list ports and inspect the selected part; check that the replacement carries both new identities.

Evidence: `RecordingsSplitTests.publishesBothPartsAndSelectsTheFirstOnlyAfterACompleteList`.

## S-4 Keep the choices after failure

Drive: Complete the split port with an error and compare visible sheet state.

Evidence: `RecordingsSplitTests.failuresKeepTheDraftAndExpiryRequiresAChoiceFromTheNewTranscript`.

## S-5 Expose a choice read failure

Drive: Complete the choices port with an error and inspect the visible state after the pending state.

Evidence: `RecordingsSplitTests.anUnreadableTranscriptAndAnEmptyChoicesListGiveDifferentReasons`.
