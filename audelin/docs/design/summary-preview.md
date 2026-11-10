# Summary preview — brief

Frames: "Screen 4b — Summary preview" (right of Screen 4) and the board
"Glass Ledger — summary preview components". Exports:
[light](exports/summary-preview/light.png),
[dark](exports/summary-preview/dark.png),
[components](exports/summary-preview/components.png).

## What is settled

- An eye button in a call's row opens a preview of that call's `summary.md`.
- One preview at a time. It follows the selected row (click or ↑↓); the eye
  opens or focuses it.
- Size and position are kept when the preview moves to another row and
  across app restarts.
- Content: a header with title, date and duration, a «Копировать» button
  (copies the Markdown source), and the summary as selectable rendered
  Markdown: headings, lists, code and tables. No transcript link.

## For the owner to pick

Eye button, one of:

- **A1 — only when a summary exists.** Rows without a summary keep an empty
  slot, so the columns stay put.
- **A2 — always, disabled when none.** Dimmed eye, tooltip «Саммари нет».
- **A3 — on hover or selection.** Only the hovered and the selected row show it.

Preview window, one of:

- **B1 — floating panel.** A separate utility panel above the list; moves
  and resizes on its own.
- **B2 — popover anchored to the row.** Under the selected row's eye; Esc or
  a click outside closes it. Its position follows the row, so only its size
  can be kept.
- **B3 — inspector side pane.** On the window's right; the list narrows.
  Only its width can be kept.

Proposed, not decided: the eye column sits just before the pin; the active
eye uses the `okBg` tint with a `me` icon, like the selected row.

## Components

| Component | Override |
|---|---|
| Eye, Eye/Active, Eye/Disabled | — |
| Calls row → `Eye cell` | Hidden by default; enable it and set the `Eye` fill and icon colour |
| Calls row/Selected | As Calls row; `okBg` row, active eye |
| Summary preview | `Title`, `Meta`, body texts |
