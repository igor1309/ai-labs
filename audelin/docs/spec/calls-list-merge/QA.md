# Calls list — merge mode — QA

Preview tests: each state is built directly as a value, rendered and
compared with reference images in light and dark; each is a named preview.
Behaviour tests check what the view sends for a click, Escape and the
toolbar control, with accessibility identifiers on the control, the marks
and the button. A row without evidence is Missing.

## S-1 Entering merge mode

Preview: merge mode with no row marked, marks shown, button disabled.
Behaviour: the toolbar control sends enter merge mode. Evidence:
`CallsListPreviews` «merge» shows the marks and the disabled button;
`CallsToolbarTests.onlyAToolbarGivenMergeHasTheMergeButtonBeforeTheActions()`
and `theMergeButtonReportsItsActionAndNamesWhatItDoes()` show the control
and its action. What that action sends: Missing.

## S-2 Merge mode is unavailable while busy

Preview: the busy reason shown in the window. Evidence: the control
disabled, `CallsToolbarTests.theMergeButtonReportsItsActionAndNamesWhatItDoes()`;
the busy reason: Missing.

## S-3 Marking rows

Preview: two rows marked, the button counting two. Behaviour: a click on a
row in merge mode sends mark, not select. Evidence: `CallsListPreviews`
«merge-marked», `CallsListMergeTests.S3_aClickInMergeModeMarksTheRow()`
and `aRowHasNoMenuInMergeMode()`.

## S-4 One marked row cannot be merged

Preview: one row marked, the button disabled. Evidence:
`CallsListPreviews` «merge-one».

## S-5 The far-apart warning

Preview: the warning with its text and both choices. Behaviour: each choice
sends merge anyway or go back. Evidence: `CallsListPreviews`
«merge-warning», `CallsListMergeBarTests.S5_eachWarningChoiceSendsItsEvent()`.

## S-6 A merge under way

Preview: merging, with its progress mark and the button disabled.
Evidence: the list, `CallsListPreviews` «merge-running» and
`CallsListMergeTests.S6_aClickWhileMergingSendsNothing()`.

## S-7 A merged call is shown

Preview: the list out of merge mode with the merged row selected, in a wide
window with the merged call read beside the list and in a narrow one with
the list alone, as the calls window shows any selected call.

## S-8 A failed merge reads why

Preview: merge mode with rows marked and the failure's reason. Evidence:
`CallsListPreviews` «merge-failed».

## S-9 Leaving merge mode

Behaviour: Escape and the toolbar control each send leave merge mode.
Evidence: a click then reads a call,
`CallsListMergeTests.S9_afterMergeModeAClickReadsACallAgain()`; Escape,
`CallsListMergeBarTests.S9_escapeLeavesMergeMode()`; the control while
merging is named «Готово», `CallsToolbarTests.theMergeButtonReportsItsActionAndNamesWhatItDoes()`.
What its action sends: Missing.

## S-10 Confirming a merge

Behaviour: with two rows marked, pressing the button sends confirm; with
one marked, pressing the disabled button sends nothing. Evidence: Return
presses the button, `CallsListMergeBarTests` S10 tests.
