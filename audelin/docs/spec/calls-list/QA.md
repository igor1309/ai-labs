# Calls list — QA

The list's state is built directly as a value, rendered and compared with
reference images, in light and dark. What the detail shows is read back
from the state the composition derives after each user event, with notes
read from a temporary calls folder. The window is driven through a fake of
its AppKit window, and on this Mac in a hands-on trial for what only the
window server shows.

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

## S-21 A narrow window shows the list alone

The window content is laid out at 699 and 700 pt; the detail is hidden at
699 and shown at 700.

## S-22 Return opens the call in a narrow window

At narrow width, Return on a call with notes; the fake summary window is
ordered front carrying that call's notes text.

## S-23 Space opens the call in a narrow window

As S-22, with Space.

## S-24 Widening shows the call again

From S-21, the content is laid out at 700 pt; the detail is shown carrying
the selected call's notes text.

## S-25 The divider holds across restarts

The fake window is given the same divider autosave name on each creation.
Missing trial: move the divider, quit and reopen Audelin; it opens where
it was.
