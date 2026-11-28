# Recordings split QA

## S-1 Keep choices with the selected transcript

Drive: Drive selection, transcript identity and reversed choice responses through reducer and handler tests.

Evidence: `RecordingsSplitTests.lateAnswersAndAnswersForAReplacedTranscriptAreIgnored`.

## S-2 Recheck eligibility

Drive: Drive idle availability to busy before confirmation and check the failure presentation and absence of a split effect.

Evidence: `RecordingsSplitTests.theDraftUsesTheAppLabelAndRechecksIdlenessOnConfirm`.

## S-3 Show successful replacement

Drive: Complete the split and fail the listing. Check the notes subscriber
gets both identities once and the window selects part 1 after a complete
listing.

Evidence: `RecordingsSplitTests.publishesBothPartsAndSelectsTheFirstOnlyAfterACompleteList`
and `SplitSelectionWiringTests`.

## S-4 Keep the choices after failure

Drive: Complete the split port with an error and compare visible sheet state.

Evidence: `RecordingsSplitTests.failuresKeepTheDraftAndExpiryRequiresAChoiceFromTheNewTranscript`
and `aPrecommitRefusalKeepsTheBoundaryAndBothTitles`.

## S-5 Expose a choice read failure

Drive: Complete the choices port with an error and inspect the visible state after the pending state.

Evidence: `RecordingsSplitTests.anUnreadableTranscriptAndAnEmptyChoicesListGiveDifferentReasons`.
