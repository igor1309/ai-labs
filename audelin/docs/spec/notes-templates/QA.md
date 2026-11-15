# Notes templates — QA

Each row names the component QA rows that drive it; the user spec itself is
checked on a real call.

## S-1 The menu lists the templates

Component rows: notes-menu S-1, S-2, S-18; summary-preview-templates S-10; composer-templates S-9; summary-preview-templates S-2; template-files S-1. Real call: Missing.

## S-2 Notes for a call without them

Component rows: notes-menu S-3; composer-templates S-1, S-2; summary-jobs-templates S-1. Real call: Missing.

Machine evidence: `MakeAgainTests.chosenTemplateStartsANewRun` and `CallNotesWiringTests.aCompletedRunAcceptsAnotherChosenTemplateRun`.

## S-3 Again with another template

Component rows: notes-menu S-3; summary-jobs-templates S-2; composer-templates S-1. Real call: Missing.

Machine evidence: `CallNotesWiringTests.aCompletedRunAcceptsAnotherChosenTemplateRun`.

## S-4 Again with the same template

Component rows: notes-menu S-4; summary-jobs-templates S-2. Real call: Missing.

Machine evidence: `CallNotesWiringTests.aCompletedRunAcceptsAnotherChosenTemplateRun` covers both the same template and another template.

## S-5 Which template made the notes

Component rows: summary-files-versions S-4; call-detail S-1; summary-preview-templates S-8. Real call: Missing.

## S-6 Keeping the previous notes

Component rows: summary-jobs-templates S-5, S-7; summary-files-versions S-1, S-2, S-9, S-10; call-detail S-2, S-3; summary-preview-templates S-6. Real call: Missing.

Machine evidence: `CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice` reads the old Current as Previous after publication. Switching the shown version remains a UI check.

## S-7 Replacing the notes

Component rows: summary-jobs-templates S-6; summary-files-versions S-3; summary-preview-templates S-7. Real call: Missing.

Machine evidence: `CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice` reads only the new Current with keeping off.

## S-8 The keep choice is beside the templates

Component rows: notes-menu S-2, S-10, S-11; keep-preference S-1 to S-5; summary-preview-templates S-4; composer-templates S-4, S-7. Real call: Missing.

Machine evidence: `KeepPreferenceTests.missingChoiceIsOnAndSavedChoiceSurvivesRelaunch`, `successfulChangesAreObserved`, `otherPreferenceUpdatesPreserveKeeping`, `failedSaveReportsFailureAndRetainsTheChoice`; `CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice` proves the shared choice reaches a run. Menu presentation remains a UI check.

## S-9 A failure keeps the notes I had

Component rows: summary-jobs-templates S-8; summary-files-versions S-7; call-detail S-4; summary-preview-templates S-9. Real call: Missing.

Machine evidence: `CallNotesWiringTests.unsuccessfulMakeAgainKeepsThePublishedPair` and `SummaryVersionsTests.aFailedTerminalSaveRestoresThePublishedPair`.

## S-10 Cancelling keeps the notes I had

Component rows: summary-jobs-templates S-9; summary-files-versions S-8; call-detail S-6; call-detail S-5; composer-templates S-8; calls-window-shell-templates S-6. Real call: Missing.

Machine evidence: `CallNotesWiringTests.unsuccessfulMakeAgainKeepsThePublishedPair`.

## S-11 An edited template is used

Component rows: template-files S-5, S-13; notes-generation S-2; summary-jobs-templates S-11. Real call: Missing.

Machine evidence: `CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice` reads Daily instructions from the file; `recoveryUsesSavedDailyInstructionsAfterItsFileChanges` proves recovery keeps the captured instructions.

## S-12 A template that cannot be used

Component rows: template-files S-4, S-10, S-15 to S-17; notes-menu S-5, S-14, S-15; template-files S-12; summary-preview-templates S-3, S-5. Real call: Missing.

## S-13 Default without usable files

Component rows: template-files S-6, S-7, S-9; notes-menu S-6, S-16. Real call: Missing.

## S-14 Older calls

Component rows: summary-files-versions S-6, proven by
`SummaryVersionsTests.legacyNotesReadAsDefaultWithoutRewriting`. Real call: Missing.
