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
- Content: a header with title, date and duration, a «Копировать» button with a copy icon (SF Symbol `doc.on.doc`)
  (copies the Markdown source), and the summary as selectable rendered
  Markdown: headings, lists, code and tables. No transcript link.

## Eye button

The eye shows only on rows with a `summary.md`. Rows without one keep an
empty slot, so the columns stay put.

## Preview window

A floating panel (`NSPanel`) with a standard title bar «Саммари — Zoom». An
eye makes it the active window; following a selected row only brings it
forward, so ↑↓ stays in the list. It
floats above the list while Audelin is active and hides when another app
is. It follows the selected row and keeps its size and position across rows
and app restarts.

Considered and dropped: a popover and an inspector pane, which cannot keep
their position; a standard window, which gets lost behind the list; a
borderless glass panel; a utility-style title bar, which is sized for tool
palettes and looks out of place over a reading window.

Proposed, not decided: the eye column sits just before the pin. The active
eye uses the `okBg` tint with a `me` icon, like the selected row.

## Typography

The preview uses the app's type scale, as the calls list and Settings do:
the reading text is the app's body text, and section labels look like the
calls table's column headers.

| Text | Font | Size | Weight | Colour |
|---|---|---|---|---|
| Title | `font-ui` | `type-title` (18) | 600 | `text` |
| Meta (date · time · duration) | `font-ui` | `type-caption` (11) | regular | `sub` |
| Markdown `#` heading | `font-ui` | `type-title` (18) | 600 | `text` |
| Section label («О ЧЁМ ВСТРЕЧА», Markdown `##`) | `font-ui` | `type-caption` (11), upper case | 600 | `sub` |
| Topic title (Markdown `###`) | `font-ui` | `type-body` (13) on `line-body` (20) | 600 | `text` |
| Paragraph and bullet text | `font-ui` | `type-body` (13) on `line-body` (20) | regular | `text` |
| Bullet dot | `font-ui` | `type-body` | regular | `sub` |
| Code | `font-data` | `type-body` | regular | `text` on `btn` |

Header padding 20 × 24 with a 6 gap under the title; body padding 20 × 24,
20 between sections, 8 under a label, 6 between bullets, 8 between dot and
text, 8 above each topic after the first. `font-ui` is IBM Plex Sans and
`font-data` IBM Plex Mono, as everywhere in the app.

## Components

| Component | Override |
|---|---|
| Eye, Eye/Active, Eye/Disabled | — |
| Calls row → `Eye cell` | Hidden by default; enable it and set the `Eye` fill and icon colour |
| Calls row/Selected | As Calls row; `okBg` row, active eye |
| Summary preview | `Title`, `Meta`, section labels, topic titles and bullet texts |
