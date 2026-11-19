# Calls list — making a transcript again — QA

Appearance rows are preview tests: each case a named preview state in the
UI module's registry, rendered and compared with its reference image.
Behaviour rows open the real menu through the accessibility API in a
preview app and record the intents the view sends.

## S-1 The item in the menu

Previews of an offered call with notes and one without: «Распознать заново» at the same place after Переименовать, enabled.
Evidence: Missing.

## S-2 A disabled item says why

Behaviour: open a not-offered call's menu; the item is disabled and its help text reads the state's reason.
Evidence: Missing.

## S-3 Restore in the menu

Preview of a call with a previous: «Вернуть прежний транскрипт» shown.
Evidence: Missing.

## S-4 No restore without a previous

Preview of a call without one: no restore item.
Evidence: Missing.

## S-5 Preparing in the row

Preview of a preparing row: the label and «Отменить».
Evidence: Missing.

## S-6 Hearing in the row

Preview of a hearing row at 40%: the bar at 40% and «Отменить».
Evidence: Missing.

## S-7 Finishing in the row

Preview of a finishing row: the label and «Отменить».
Evidence: Missing.

## S-8 A failure under the list

Preview of a failed run: the reason under the list and «Повторить».
Evidence: Missing.

## S-9 A stop by a recording under the list

Preview of a run stopped by a recording: that line, no retry.
Evidence: Missing.

## S-10 Choosing the item asks for that call

Behaviour: choose the item on the second row: one run intent with that row's call.
Evidence: Missing.

## S-11 Choosing restore asks for that call

Behaviour: choose restore on a row: one restore intent with its call.
Evidence: Missing.

## S-12 Cancel and retry are sent

Behaviour: press «Отменить» in a row, then «Повторить» under the list: a cancel, then a retry with the call.
Evidence: Missing.

## S-13 Restore disabled says why

Behaviour: a call with a previous during a run: restore disabled, its help text the reason; a restore that fails shows its reason under the list.
Evidence: Missing.

## S-14 A failed restore under the list

Preview of a state carrying a restore failure: the reason under the list.
Evidence: Missing.
