# Notes menu — QA

Each row is a reducer test paired with its effect test, through fake
notes, catalogue, keep and folder ports; intentions are read from the
machine's output.

## S-1 Make section without notes

Reducer: no notes + menu opened → effect read catalogue; answered → make
section, no keep item. Effect: read catalogue delivers the fake catalogue.
Evidence: `NotesMenuTests.sectionAndKeepFollowTheShownCall and openingRefreshesTheCatalogueEveryTime, paired with effectReadsTheCatalogueAndPreservesItsRevision`.

## S-2 Make again with notes

As S-1 with notes → make-again section, keep item on. Evidence: `NotesMenuTests.sectionAndKeepFollowTheShownCall and openingRefreshesTheCatalogueEveryTime, paired with effectReadsTheCatalogueAndPreservesItsRevision`.

## S-3 Choosing a template

Reducer: template chosen Daily → intention (call, Daily, generate), no
effect. Effect: none. Read back the output's one value. Evidence: `NotesMenuTests.choosingAnyListedTemplatePublishesOneIntention`.

## S-4 Choosing the shown notes' template

As S-3 with Default on notes made with Default. Evidence: `NotesMenuTests.choosingAnyListedTemplatePublishesOneIntention`.

## S-5 An unusable template

Reducer: catalogue answered with Daily unusable → Daily disabled, reason,
folder action. Effect: as S-1. Evidence: `NotesMenuTests.unusableEntriesKeepTheirReasonsAndCannotBeChosen` and `effectReadsTheCatalogueAndPreservesItsRevision`.

## S-6 Default without usable files

As S-5 with every file unusable → built-in Default enabled. Evidence: `NotesMenuTests.unusableEntriesKeepTheirReasonsAndCannotBeChosen` (no usable file) and `noFilesFormattingRunsOnlyForAnAcceptedCatalogueWithoutUsableFiles`.

## S-10 Toggling keep

Reducer: keep toggled → saving, effect save off; answered → off. Effect:
fake keep port records off and delivers saved. Evidence: `NotesMenuTests.keepWaitsForTheSaveBeforeChanging, paired with effectSavesExactlyTheRequestedKeepValue`.

## S-11 A failed keep save

As S-10 with the fake failing → on with reason. Evidence: `NotesMenuTests.keepWaitsForTheSaveBeforeChanging, paired with effectReturnsTheSaveFailure`.

## S-14 Opening the folder

Reducer: open folder → effect open folder; answered failure → reason.
Effect: fake folder port delivers its outcome. Evidence: `NotesMenuTests.folderActionWaitsForItsOutcomeAndAllowsRetry` and `folderEffectReportsTheBindingOutcome`.

## S-15 A repaired template on reopening

Reducer: Daily unusable, menu opened again → effect read catalogue;
answered usable → Daily enabled. Effect: the fake answers the fixed
catalogue. Evidence: `NotesMenuTests.reopeningReplacesBrokenEntriesWithRepairedFiles` and `effectReadsTheCatalogueAndPreservesItsRevision`.

## S-16 The catalogue cannot be read

Reducer: catalogue failed → built-in Default enabled with the reason.
Effect: the fake fails the read. Evidence: `NotesMenuTests.folderReadFailureKeepsDefaultAndItsReason`.

## S-18 No template while notes are being made

Reducer: facts changed busy + menu opened → every template disabled; a
template chosen while busy publishes no intention. Effect: read catalogue as
S-1. Evidence: `NotesMenuTests.busyFactsDisableEveryTemplateAndPublishNoChoice, paired with effectReadsTheCatalogueAndPreservesItsRevision`.
