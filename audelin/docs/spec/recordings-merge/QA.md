# Recordings — merging calls — QA

An async machine: each row is reducer cases with the effect each event
asks for, paired with effect tests for the same state and event. Whether
Audelin is idle is a state field set by its event. The busy message is a
spy: not called on init or when nothing is refused, called once on each
refusal, and its stub text is the reason in the state. The handler's merge port is a spy whose completion is
delivered as the result event. A row without evidence is Missing.

## S-1 Merge mode opens while idle

Idle and available, enter merge mode: merge mode, nothing selected, no
effect. Evidence:
`RecordingsMergeTests.S1_mergeModeOpensWithNothingSelected()`,
`mergeModeWaitsForOtherActions()`, `theBusyMessageIsNotAskedOnInit()` and
`theBusyMessageIsAskedOnlyWhenAMergeIsRefused()`.

## S-2 Merge mode is refused while busy

Idle and not available, enter merge mode: idle with the busy
reason, no effect. Evidence:
`RecordingsMergeTests.S2_mergeModeIsRefusedWhileBusy()`.

## S-3 Selecting calls

Merge mode, select A then B, unselect A: B selected, no effect. Evidence:
`RecordingsMergeTests.S3_selectingAndUnselectingCalls()`.

## S-4 Fewer than two calls do not merge

Merge mode with A selected, confirm: no change, no effect, whether or not
merging is available. Evidence: `RecordingsMergeTests.S4_fewerThanTwoCallsDoNotMerge()`.

## S-5 Neighbouring calls merge

Merge mode with neighbours A and B, available, confirm: merging A and B, effect
merge. The handler asks the port for A and B. Evidence:
`RecordingsMergeTests.S5_neighbouringCallsMerge()` and
`RecordingsMergeEffectTests.S5_theHandlerAsksThePortForTheCallsAndDeliversTheMergedCall()`.

## S-6 Far-apart calls ask again

Merge mode with A and C, B between them in the full list, confirm: warned,
no effect. With a search hiding B the result is the same. Evidence:
`RecordingsMergeTests.S6_farApartCallsAskAgain()`; the rule reads only the
whole list, which a search does not change:
`callsAreFarApartWhenAnUnselectedCallLiesBetween(_:_:)`; the warning comes
whether or not merging is available:
`theBusyMessageIsAskedOnlyWhenAMergeIsRefused()`.

## S-7 Merging anyway after the warning

Warned about A and C, available, merge anyway: merging A
and C, effect merge. Evidence: `RecordingsMergeTests.S7_mergingAnywayAfterTheWarning()`.

## S-8 Going back after the warning

Warned about A and C, go back: merge mode with A and C selected, no effect.
Evidence: `RecordingsMergeTests.S8_goingBackAfterTheWarningKeepsTheSelection()`
and `theWarningTakesNoSelectionChange()`.

## S-9 Confirming while busy is refused

Merge mode with A and B, not available, confirm: merge mode with the
busy reason, no effect. Evidence:
`RecordingsMergeTests.S9_confirmingWhileBusyIsRefused()`.

## S-10 A merged call is selected

Merging A and B, merged as M: idle with M selected, effect list. Evidence:
`RecordingsMergeTests.S10_aMergedCallIsSelected()`,
`enteringMergeModeForgetsTheLastMergedCall()` and
`nothingElseStartsWhileAMergeRuns()`.

## S-11 A failed merge is named

Merging A and B, failed with a reason: merge mode with A and B and the
reason, no effect. Evidence: `RecordingsMergeTests.S11_aFailedMergeIsNamed()`
and `RecordingsMergeEffectTests.S11_theHandlerDeliversWhyAMergeFailed()`.

## S-12 Leaving merge mode

Merge mode with A selected, leave: idle, nothing selected; a rename then
starts. Evidence:
`RecordingsMergeTests.S12_leavingMergeModeClearsTheSelection()`; no other
action starts in merge mode: `noOtherActionStartsInMergeMode()`.

## S-13 Merging anyway while busy is refused

Warned about A and C, not available, merge anyway: merge
mode with A and C and the busy reason, no effect. Evidence:
`RecordingsMergeTests.S13_mergingAnywayWhileBusyIsRefused()`.

## S-14 Idleness is kept until it changes

Not available, available arrives: available; available, not available
arrives: not available; the same value again: no change; during a merge
the value is kept and the merge goes on. No effect. A new state is not
available. Evidence:
`RecordingsMergeTests.S14_mergeAvailabilityIsKeptUntilItChanges()` and
`S14_mergeAvailabilityIsNotKnownBeforeItArrives()`; compose sends the
current value and each change once:
`MergeAvailabilityWiringTests.recordingsHearsTheCurrentValueAndEachChangeOnce()`.
