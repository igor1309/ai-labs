# Brief: summary preview options (LAB-1160)

Frames: "Screen 4b — Summary preview" in
[visual-language.pen](visual-language.pen), right of Screen 4. Exports:
[light](exports/screen-4b-summary-preview-light.png),
[dark](exports/screen-4b-summary-preview-dark.png).

Options for the owner to choose from; nothing is implemented.

## Common to every option

- One preview at a time. It follows the selected row (click or arrow keys);
  the eye opens it or brings it forward.
- Content: title, date and duration, a copy button, and the summary as
  selectable text (a term can be selected for bb). No transcript link.
- The preview keeps its size when it shows another row.

## Eye button

- **A — only when a summary exists.** A 24 pt slot before the pin; empty on
  rows without a summary, so columns do not shift.
- **B — always shown, disabled without a summary.** Grey (`disText`), with
  the tooltip «Сводки пока нет».
- **C — on hover or selection.** Shown only on the hovered and the selected
  rows, like the other row actions.

## Preview window

- **1 — floating panel.** A separate utility panel beside the calls window
  that you can move and resize. Its size and position are remembered.
- **2 — popover anchored to the row.** It sits under the eye of the selected
  row and moves with the selection. It closes on Esc or a click outside.
- **3 — inspector side pane.** A right-hand pane inside the calls window. A
  divider sets its width, which is remembered. The eye toggles it.

## Width classes and input

macOS only. Mouse: the eye or a row click. Keyboard: arrow keys move the
selection, and the preview follows.

## Proposed, not decided

- The phosphor `eye` and `copy` icons, the `okBg` tint for the selected row,
  Space to open the preview, and ⌥⌘I for the inspector.
- The summary is shown as plain text with headings until a Markdown renderer
  is chosen.
