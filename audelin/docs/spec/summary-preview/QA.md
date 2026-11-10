# Summary preview — QA

The panel's view is driven by states built directly, rendered and compared
with reference images, in light and dark. The Markdown rendering is
checked on its attributed text. The AppKit panel is driven through a fake
of its window, and on this Mac in a hands-on trial for what only the
window server shows: ordering, app switching and a restart.

## S-1 The header names the call

A state for a call with a title, date and duration; the image shows the
three in the header.

## S-2 Notes read as formatted text

A summary with two heading levels, nested and ordered lists, fenced code
and a table renders to attributed text with heading fonts, list markers, a
monospaced code run and a text table; a panel image shows them.

## S-3 Any part can be selected

The panel's text view is selectable and not editable; a range of it is
selected and copied to a private pasteboard, which reads back exactly
that range's text.

## S-4 Copying the notes

Pressing «Копировать» through the real clipboard binding, given a private
pasteboard; the pasteboard reads back the summary's Markdown source, byte
for byte.

## S-5 Unreadable notes

A state carrying a read failure; the image shows the reason in place of
the notes.

## S-6 The panel stays above the list

The fake window is made a floating utility panel. Missing trial: click and
arrow through the calls list with the panel open, captured on screen.

## S-7 The eye brings the panel forward

Pressing an eye orders the fake window front. Missing trial: the panel
behind Settings comes in front on an eye, captured on screen.

## S-8 Another app hides the panel

The fake window is set to hide when the app is inactive. Missing trial:
switch to Finder, captured on screen.

## S-9 Coming back shows the panel

Missing trial: from S-8, switch back to Audelin; the panel shows at the
same frame, captured on screen.

## S-10 The place holds across calls

The fake window keeps one panel for every call; showing another call
changes its content and never its frame.

## S-11 The place holds across restarts

The fake window is given the same frame autosave name on each creation.
Missing trial: move and resize the panel, quit and reopen Audelin, open
the panel; it opens at the same frame.

## S-12 The close button closes the panel

The window's close sends close; the fake window is ordered out.
