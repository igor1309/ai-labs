# Summary preview — brief

Frames: "Screen 4b — Summary preview" (right of Screen 4) and the board
"Glass Ledger — summary preview components" in
[visual-language.pen](visual-language.pen).

The eye button and the floating preview panel these frames draw are not
built: the calls window shows the selected call's notes beside the list
([brief](calls-list.md)). The frames stay for the typography below, which
the calls window's detail uses.

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
