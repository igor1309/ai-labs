# Summary preview — QA

The view is driven by states built directly, rendered and compared with
reference images, in light and dark. The Markdown rendering is checked on
its attributed text. Events the view sends are read back from its event
closure. The call's own window is driven through a fake of its window.

## S-1 The header names the call

A state for a call with a title, date and duration; the image shows the
three in the header.

## S-2 Notes read as formatted text

A summary with two heading levels, nested and ordered lists, fenced code
and a table renders to attributed text with heading fonts, list markers, a
monospaced code run and a text table; an image shows them.

## S-3 Any part can be selected

The text view is selectable and not editable; a range of it is selected
and copied to a private pasteboard, which reads back exactly that range's
text.

## S-4 Copying the notes

The copy action through the real clipboard binding, given a private
pasteboard; the pasteboard reads back the summary's Markdown source, byte
for byte.

## S-5 Unreadable notes

A state carrying a read failure; the image shows the reason in place of
the notes.

## S-13 Notes being prepared

A preparing state; the image shows the spinner and «Подготовка итогов…».

## S-14 Notes that failed

A failed state with a reason; the image shows the alert, «Не удалось
подготовить итоги» and the reason.

## S-15 Retrying failed notes

Pressing «Повторить итоги» sends the retry event for the call; the
composition then derives the preparing state for it.

## S-16 No notes while notes are off

A no-notes state with notes off; the image shows «Итогов нет» and the
Settings hint.

## S-17 No notes while notes are on

A no-notes state with notes on; the image shows «Итогов нет» alone.

## S-18 Nothing selected

A no-selection state; the image shows «Звонок не выбран».

## S-19 The call's actions

The toolbar's buttons are named Копировать, Открыть, Переименовать and
Удалить… in their tooltips, in Russian and English, and each sends its
event: copy, open, rename, delete. The calls window's toolbar ends with the
search field; the call's own window has the buttons and no field.

## S-20 Nothing to copy

The buttons' enabled state is derived from the detail: with notes all four
act; without notes Копировать is disabled and the rest act; with no call
selected all four are disabled.

## S-12 The close button closes the call's own window

The window's close sends close; the fake window is ordered out.
