# Summary preview UI, templates — QA

Driven with the same named presentation fixtures as CallsPreview. Native menu
and segmented-control values and accessibility identify the controls; interactions
are read from a recording sink. Light and dark views are compared with reference images.

## S-1 The menu button beside Copy

Drive: fixture with notes; read back the actions' order Copy, then menu.
Evidence: `CallsToolbarTests.theNativeTemplateMenuFollowsCopyAndReceivesTheSuppliedItems`.

## S-2 The menu's section

Drive: open the menu on the make-again fixture; read back the heading text
and the item titles. Clicking requests refresh, stale answers do not open it,
and each newer answer presents exactly once per opening, including reopening. Evidence: `NotesTemplatePreviewTests.nativeMenuDrawsItsSectionItemsAndKeepCheck`,
`aCallWithoutNotesHasOnlyTheMakeSectionAndTemplates` and
`eachOpeningPresentsOnlyOneRefreshedCatalogue`.

## S-3 A disabled template

Drive: fixture with Daily unusable; read back Daily disabled with its
reason, and pressing it records no interaction. Evidence: Missing.

## S-4 The keep check item

Drive: fixtures keep on and off; read back the item's checked value.
Evidence: `NotesTemplatePreviewTests.nativeMenuDrawsItsSectionItemsAndKeepCheck`.

## S-5 The folder action

Drive: choose the folder action; read back the one recorded interaction.
The folder opening itself is template-files S-10 through composer wiring.
Evidence: Missing.

## S-6 The version switch

Drive: pair fixture; choose Previous; read back the recorded interaction
and, after the next fixture, Previous text. Evidence: `NotesTemplatePreviewTests.versionSwitchSendsTheChosenVersionAndDrawsTheNextSuppliedValue and drawsTemplateStates`.

## S-7 No switch for one version

Drive: Current-only fixture; read back no switch element. Evidence: `NotesTemplatePreviewTests.aSingleVersionHasNoSwitchAndRepeatsItsTemplateInTheFooter and drawsTemplateStates`.

## S-8 The template line

Drive: Daily fixture; read back the header's template text. Evidence: `NotesTemplatePreviewTests.aSingleVersionHasNoSwitchAndRepeatsItsTemplateInTheFooter and drawsTemplateStates`.

## S-9 Progress beside the notes

Drive: progress-with-notes fixture; read back both progress and notes
text. Evidence: `NotesTemplatePreviewTests.remakingKeepsNotesReadableAndCancelSendsItsInteraction and drawsTemplateStates`.

## S-10 The menu while notes are being made

Drive: busy fixture; read back every template item disabled, pressing one
records no interaction, and Cancel records cancel. Evidence: `NotesTemplatePreviewTests.busyMenuItemsCannotSendAChoice and remakingKeepsNotesReadableAndCancelSendsItsInteraction`.
