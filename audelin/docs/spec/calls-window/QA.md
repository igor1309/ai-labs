# Calls window — QA

The window is driven through a fake of its AppKit window and Finder, and
on this Mac in a hands-on trial for what only the window server shows.
List states are built directly as values, rendered and compared with
reference images, in light and dark.

## S-1 A narrow window shows the list alone

The window content is laid out at 699 and 700 pt; the call is hidden at
699 and shown at 700.

## S-2 Return opens the call in a narrow window

At narrow width, Return on a call with notes; the fake summary window is
ordered front carrying that call's notes text.

## S-3 Space opens the call in a narrow window

As S-2, with Space.

## S-4 Widening shows the call again

From S-1, the content is laid out at 700 pt; the call is shown carrying
the selected call's notes text.

## S-5 The divider holds across restarts

The fake window is given the same divider autosave name on each creation.
Missing trial: move the divider, quit and reopen Audelin; it opens where
it was.

## S-6 Return in a wide window opens the folder

At wide width, Return on a call; the fake Finder is asked to show that
call's folder, and no summary window is ordered front.

## S-7 A double-click opens the folder

A double-click on a row; the fake Finder is asked to show that call's
folder.

## S-8 Tab moves between the list and the call

Missing trial: with the list focused, Tab puts focus in the call's text,
which selects and copies; Tab again returns it to the list.

## S-9 An inactive window keeps its selection

A state with a selected call, rendered inactive; the image shows the row
in the inactive selection colour.

## S-10 No calls yet

The empty state; the image shows its centred message and no rows.

## S-11 Calls still being read

The loading state; the image shows its centred message and no rows.

## S-12 A failed action says why

A state carrying an error; the image shows the banner pinned to the
bottom of the list with the error text, and the rows above it.
