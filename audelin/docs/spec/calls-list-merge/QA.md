# Calls list — merge mode — QA

Preview tests: each state is built directly as a value, rendered and
compared with reference images in light and dark; each is a named preview.
Behaviour tests check what the view sends for a click, Escape and the
toolbar control, with accessibility identifiers on the control, the marks
and the button. Evidence: Missing for every row.

## S-1 Entering merge mode

Preview: merge mode with no row marked, marks shown, button disabled.
Behaviour: the toolbar control sends enter merge mode.

## S-2 Merge mode is unavailable while busy

Preview: the busy reason shown in the window.

## S-3 Marking rows

Preview: two rows marked, the button counting two. Behaviour: a click on a
row in merge mode sends mark, not select.

## S-4 One marked row cannot be merged

Preview: one row marked, the button disabled.

## S-5 The far-apart warning

Preview: the warning with its text and both choices. Behaviour: each choice
sends merge anyway or go back.

## S-6 A merge under way

Preview: merging, with its progress mark and the button disabled.

## S-7 A merged call is shown

Preview: the list out of merge mode with the merged row selected, in a wide
window with the merged call read beside the list and in a narrow one with
the list alone, as the calls window shows any selected call.

## S-8 A failed merge reads why

Preview: merge mode with rows marked and the failure's reason.

## S-9 Leaving merge mode

Behaviour: Escape and the toolbar control each send leave merge mode.
