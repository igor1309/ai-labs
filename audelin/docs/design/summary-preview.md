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

## Eye button: A1 (picked)

The eye shows only on rows with a `summary.md`. Rows without one keep an
empty slot, so the columns stay put.

## Preview window: B1 (picked)

A utility panel (`NSPanel`) with a small title bar «Саммари — Zoom». It
floats above the list while Audelin is active and hides when another app
is. It follows the selected row and keeps its size and position across rows
and app restarts.

Considered and dropped: a popover and an inspector pane, which cannot keep
their position; a standard window, which gets lost behind the list; a
borderless glass panel.

Proposed, not decided: the eye column sits just before the pin. The active
eye uses the `okBg` tint with a `me` icon, like the selected row.

## Components

| Component | Override |
|---|---|
| Eye, Eye/Active, Eye/Disabled | — |
| Calls row → `Eye cell` | Hidden by default; enable it and set the `Eye` fill and icon colour |
| Calls row/Selected | As Calls row; `okBg` row, active eye |
| Summary preview | `Title`, `Meta`, body texts |
