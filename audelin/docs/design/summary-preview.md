# Summary preview — brief

Frames: "Screen 4b — Summary preview" (right of Screen 4) and the board
"Glass Ledger — summary preview components" in
[visual-language.pen](visual-language.pen).

## What is settled

- An eye button in a call's row opens a preview of that call's `summary.md`.
- One preview at a time. It follows the selected row (click or ↑↓); the eye
  opens or focuses it.
  On a row without a `summary.md` it hides, and shows again on the next
  row that has one.
- Size and position are kept when the preview moves to another row and
  across app restarts.
- Content: a header with title, date and duration, a «Копировать» button
  (copies the Markdown source), and the summary as selectable rendered
  Markdown: headings, lists, code and tables. No transcript link.

## Eye button

The eye shows only on rows with a `summary.md`. Rows without one keep an
empty slot, so the columns stay put.

## Preview window

A utility panel (`NSPanel`) with a small title bar «Саммари — Zoom». It
floats above the list while Audelin is active and hides when another app
is. It follows the selected row and keeps its size and position across rows
and app restarts.

Considered and dropped: a popover and an inspector pane, which cannot keep
their position; a standard window, which gets lost behind the list; a
borderless glass panel.

Proposed, not decided: the eye column sits just before the pin. The active
eye uses the `okBg` tint with a `me` icon, like the selected row.

## Typography

Reading contrast: small monospaced section labels against larger, open body
text, on the `surface` fill.

| Text | Font | Size | Weight | Colour |
|---|---|---|---|---|
| Title | `font-ui` | `type-display` (30), tracking −0.8 | 600 | `text` |
| Meta (date · time · duration) | `font-ui` | `type-caption` (11) | regular | `sub` |
| Section label («О ЧЁМ ВСТРЕЧА») | `font-data` | `type-body` (13), line 1.6 | 600 | `sub` |
| Topic title | `font-ui` | `type-topic` (15), line 1.6 | 600 | `text` |
| Paragraph and bullet text | `font-ui` | `type-reading` (16), line 1.6 | regular | `text` |
| Bullet dot | `font-ui` | `type-reading` | regular | `sub` |

Header padding 24 × 28 with an 8 gap under the title; body padding 24 × 28,
28 between sections, 12 under a label, 8 between bullets, 12 between dot and
text, 12 above each topic after the first. The app sets `font-ui` as SF Pro
and `font-data` as SF Mono.

## Components

| Component | Override |
|---|---|
| Eye, Eye/Active, Eye/Disabled | — |
| Calls row → `Eye cell` | Hidden by default; enable it and set the `Eye` fill and icon colour |
| Calls row/Selected | As Calls row; `okBg` row, active eye |
| Summary preview | `Title`, `Meta`, section labels, topic titles and bullet texts |
