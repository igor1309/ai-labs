# Calls list — QA

The list's state is built directly as a value, rendered and compared with
reference images, in light and dark. What the detail shows is read back
from the state the composition derives after each user event, with notes
read from a temporary calls folder.

## S-13 A row says what the call was about

A state with a call whose notes open «О чём встреча»; the image shows its
title, time, duration and that section's first sentence. The gist itself
is read back from the notes by the gist function's tests.

## S-14 A row whose notes are being prepared

A state with a preparing call; the image shows «Подготовка итогов…» and the
spinner on its second line.

## S-15 A row whose notes failed

A state with a failed call; the image shows «Не удалось подготовить итоги»
in the error colour with the alert.

## S-16 A row without notes

A state with a call without notes; the image shows its title, time and
duration and nothing else on the second line.

## S-17 A click shows the call

Selecting a call with notes; the derived detail carries that call's notes
text.

## S-18 An arrow key shows the call

With a call selected, the down and up arrows; the derived detail carries
the newly selected call's notes text each time.

## S-19 Notes that finish while I watch

A selected preparing call; its notes are written to the folder and the
summary status changes; the detail carries the notes text and the row
carries the gist.

## S-20 Retry replaces the notes I read

`cd audelin/macos/App && swift test --filter SummaryCompositionTests` holds a
retry with previous notes selected, asserts the old text stays readable,
completes it, and asserts the detail carries the new text.

## S-27 Making notes from a row

The row menu of a row that can make notes lists «Сделать итоги» and
sends the make event for that row; a row that cannot does not list it,
and a busy list disables it (`CallsListRowMenuTests`). The row's second
line then shows «Подготовка итогов…» and the spinner.

## S-26 An untitled call shows its folder name

A state with a call whose title is empty; the image shows its folder name
in the data font and the secondary colour on its first line.
