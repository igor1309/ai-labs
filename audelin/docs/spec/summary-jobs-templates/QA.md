# Summary jobs, templates — QA

Reducer tests drive state and effects directly; effect tests use fake
ports. Composer tests read the published pair and saved attempts through
the storage boundary, with runtime handshakes.

## S-1 Make notes with a chosen template

Evidence: `MakeAgainTests.chosenTemplateStartsANewRun`,
`transcriptReadKeepsTheChosenTemplate`, `selectedContentIsCapturedBeforeTheClaim`,
`selectionDeliversTheRequestedTemplateOrItsFailure`;
`CallNotesWiringTests.aCompletedRunAcceptsAnotherChosenTemplateRun` reads the
runtime requests and Default/Daily attribution.

## S-2 Make notes again after success

Evidence: `MakeAgainTests.chosenTemplateStartsANewRun`,
`selectionDeliversTheRequestedTemplateOrItsFailure`,
`claimEffectDispatchesTheAdmissionIntent`;
`CallNotesWiringTests.aCompletedRunAcceptsAnotherChosenTemplateRun` and
`chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`.

## S-3 One run at a time

Evidence: `MakeAgainTests.anotherRequestCannotOverlap` covers all active
stages; `CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
asserts one runtime request after a second intention.

## S-4 Automatic notes use Default

Evidence: `MakeAgainTests.automaticPreparationSelectsDefault`,
`selectionDeliversTheRequestedTemplateOrItsFailure`,
`shutdownFinishesCapturingAnAcceptedAutomaticJob`;
`SummaryCompositionTests.automaticNotesUseTheEditedDefaultFileAndItsHeadings`
reads back Default attribution.

## S-5 Keeping on rotates

Evidence: `MakeAgainTests.preparationCapturesKeeping`,
`publicationUsesOnlyTheCapturedChoice`, `publicationEffectDispatchesTheSelectedPolicy`;
`SummariesFilesPortTests.capturedTemplateAndKeepingSurviveStorageAndDrivePublication`;
`CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
reads the old Current as Previous.

## S-6 Keeping off replaces

Evidence: `MakeAgainTests.preparationCapturesKeeping`,
`publicationUsesOnlyTheCapturedChoice`, `publicationEffectDispatchesTheSelectedPolicy`;
`SummariesFilesPortTests.capturedTemplateAndKeepingSurviveStorageAndDrivePublication`;
`CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
reads only new Current.

## S-7 A later toggle does not change a run

Evidence: `MakeAgainTests.publicationUsesOnlyTheCapturedChoice` ignores a
late keep answer; `CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
toggles while the runtime is held and reads the captured publication policy.

## S-8 A failure keeps the published notes

Evidence: `SummariesGenerationReducerTests.failedNotesAreSavedAsFailed`,
`failedNotesDeliverAFailedSave`,
`SummariesGenerationEffectHandlerTests.failedNotesDeliverNotesFailure`;
`CallNotesWiringTests.unsuccessfulMakeAgainKeepsThePublishedPair` reads the
unchanged pair after runtime failure. A failed terminal write restores the
pair in `SummaryVersionsTests.aFailedTerminalSaveRestoresThePublishedPair` and
`terminalReadAndRollbackCheckFailuresRestoreThePublishedPair`;
`terminalRollbackNeverOverwritesAnotherPublication` checks output ownership.

## S-9 Cancelling keeps the published notes

Evidence: `MakeAgainTests.cancellationWaitsForPreparationWithoutClaiming`;
`SummariesCancelReducerTests.aResultAfterACancelDeliversDiscard` and
`SummariesCancelEffectHandlerTests.discardRemovesTheJobAndDeliversDiscarded`;
`CallNotesWiringTests.unsuccessfulMakeAgainKeepsThePublishedPair` reads the
unchanged pair after cancellation;
`SummaryVersionsTests.discardReadAndRollbackCheckFailuresKeepThePublishedPair`
covers disk failures while discarding.

## S-10 A template that cannot be resolved

Evidence: `MakeAgainTests.aMissingTemplateFailsBeforeAnyClaim`,
`selectionDeliversTheRequestedTemplateOrItsFailure`,
`retryingAnUnresolvedTemplateKeepsItsSelection`;
`CallNotesWiringTests.unsuccessfulMakeAgainKeepsThePublishedPair` asserts no
runtime request and unchanged notes for a missing template.

## S-11 Recovery uses the saved template

Evidence: `MakeAgainTests.recoveryUsesTheSavedTemplateWithoutResolution`;
`SummariesFilesPortTests.capturedTemplateAndKeepingSurviveStorageAndDrivePublication`;
`CallNotesWiringTests.recoveryUsesSavedDailyInstructionsAfterItsFileChanges`
reads the runtime's saved instructions and the captured replacement choice.
