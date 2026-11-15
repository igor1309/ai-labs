# Composer, templates — QA

Driven on the assembled composer with fake adapters at its outer
boundary (folder, runtime, settings store), read back through the
machines' published state; ordering by handshakes.

## S-1 A chosen template reaches the jobs

Drive: send template chosen Daily to the detail; read back SummaryJobs'
progress for the call with Daily and the fake runtime's request carrying
the fixture Daily instructions. Evidence:
`CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
and `aCompletedRunAcceptsAnotherChosenTemplateRun`.

## S-2 Progress reaches the detail

Drive: gate the fake runtime; read back the detail's progress. Evidence:
`CallNotesWiringTests.requestedNotesWorkWithAutomaticNotesOff`.

## S-3 A publication reaches the detail

Drive: release the runtime; read back the detail's new Current text.
Evidence: `CallNotesWiringTests.requestedNotesWorkWithAutomaticNotesOff`.
Previous/Current selection: `CallNotesWiringTests.menuChoiceDisablesTemplatesDuringTheRunAndPublicationShowsCurrent`.

## S-4 The keep choice is shared

Drive: toggle keep in the detail, then request; read back the fake
storage's replacement commit. Evidence:
`CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
reads the final pair for both choices, including a toggle after preparation.

## S-5 Search reads Current

Drive: pair fixture with a word only in Current and one only in Previous;
search both; read back one hit, then none, with the Current gist. Evidence:
`CallsSearchWiringTests.searchAndGistsReadOnlyCurrentOfAPair`.

## S-6 Work survives another selection

Drive: gate the runtime, select another call; read back the first call's
progress still running. Evidence:
`CallNotesWiringTests.chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice`
selects another call while the runtime is held and reads the first call's
completed publication.

## S-7 Another detail sees the keep change

Drive: present two details, toggle keep in one; read back the other's keep
value off. Evidence: `NotesMenuCompositionTests.anotherPresentedDetailReceivesTheSavedKeepChoice`.

## S-8 A cancel reaches the jobs

Drive: gate the runtime, send cancel to the detail; read back SummaryJobs'
ended run and the storage's unchanged pair. Evidence:
`CallNotesWiringTests.unsuccessfulMakeAgainKeepsThePublishedPair`.

## S-9 The menu follows the shown call

Drive: gate the runtime, start a run from the menu, reopen it; read back the
menu's templates all disabled. Evidence: `CallNotesWiringTests.menuChoiceDisablesTemplatesDuringTheRunAndPublicationShowsCurrent`.
