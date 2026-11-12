# Calls window

The "Calls — …" frames in [visual-language.pen](visual-language.pen) draw
the calls window: the calls list on the left and the selected call's summary on the right, Mail-style. It
replaces the list window and the floating summary panel. Each screen is a
light component with a dark instance (`theme: {mode: "dark"}`); the tokens
are the file's variables. Shared parts are on the
"Calls window — shared components" board (Title bar, Search field, Day
header, Context menu); delete, rename and errors use the Glass Ledger
Sheet, Rename field and Banner/Error; the window's own parts on the "Calls window —
components" board (Detail bar, Two-line row, Two-line match row, Detail
header, Section, Subhead, Paragraph, Bullet, Detail message, No summary
line, Link/Make, Making line, Summary skeleton, Summary date).

## Layout

- The list is 340 pt; the divider moves between 280 and 420 and is kept
  across restarts. Below 700 pt the detail hides and the list fills the
  window (minimum 560); Return or Space then opens the selected call in its
  own window, which keeps its size and place and follows the selection.
  Widening the window brings the detail back.
- No sorting and no column header. Days run newest first, calls within a
  day newest first.
- Day header: Сегодня, Вчера; then weekday and date within the last 7 days
  (Пятница, 7 ноября); older days the date (3 сентября), with the year only
  when it is not the current one (12 декабря 2025). It shows the day's call
  count.
- Row, two lines: title and start time (HH:mm, `font-data`); then duration
  and the gist, the first sentence of the summary's «О чём встреча». Each
  line truncates with an ellipsis; every row has the same height.
- Preparing: the gist line says «Подготовка итогов…» in `gutter` with a
  spinner. Failed: «Не удалось подготовить итоги» in `rec` with the alert.
  No summary: the second line holds only the duration. Making a summary
  from the detail shows the same «Подготовка итогов…» and spinner. An untitled call
  shows its folder name in `font-data`, `gutter`.

## Detail

- Header: title, then day, start time · duration. The summary is
  selectable rendered Markdown (headings, lists, code, tables). Under its
  last line, the date it was made in `gutter`, `type-caption`
  («Сделано 12 ноября, 14:05»). Toolbar: Копировать (the Markdown source)
  and ⋯ with the row menu.
- No summary: one line under the header, «Нет итогов» in `gutter` and the
  link «✨ Сделать» in `me`. The word «итоги» is not repeated in the button.
- Making: the line becomes a spinner, «Делаю…», the elapsed time
  (`font-data`) and «Отменить» in `sub`, over a grey skeleton of the summary
  (`btn` bars). The user may select another call meanwhile; the row keeps
  the spinner. On completion the summary replaces line and skeleton.
  Отменить returns to the no-summary line.
- Preparing after a call: one centred message under the header. Failed,
  after a call or from Сделать: the centred error with Повторить итоги.
  With no call selected: «Звонок не выбран». Копировать and ⋯ are hidden
  whenever there is no summary.
- The detail follows the selection at once. No transcript in this window.

## Actions

- Hover changes nothing in a row. A right-click selects the row and opens
  its menu at the pointer: Открыть, Переименовать, Сделать итоги (only
  when there is none), Повторить итоги (only when the summary failed),
  Удалить…. Открыть shows the call's folder in
  Finder.
- Keys: ↑↓ select, Return opens, ⌘R renames, ⌘⌫ asks to delete, Tab moves
  focus between the list and the detail. Double-click opens.

## Search

- The search field is in the list's title bar. ⌘F focuses it; Esc or its
  clear button empties it and the whole list returns.
- One field searches titles, summaries and transcripts as you type, ignoring
  case and ё/е. There is no scope switch.
- Results keep the list's shape. A day shows only its matching calls and
  their count; days with no match are hidden.
- A match row keeps two lines: the title and time, then where the first
  match is (its time in the transcript, or «Итоги»), the text around it,
  and «ещё N» for further matches. Every match is marked with `hit`.
- While transcripts are still being read, the field shows a spinner and the
  list ends with «Ищу в расшифровках…»; rows join as they are found.
- With no match, the list shows one centred message naming the query and
  the detail «Звонок не выбран». The detail shows the selected call's
  summary.

## States

| Frame | What it shows |
|---|---|
| Calls — summary | A call selected, its summary in the detail |
| Calls — preparing | The selected call's summary is being prepared |
| Calls — summary failed | The error and Повторить итоги |
| Calls — no summary | «Нет итогов» and the link «✨ Сделать» |
| Calls — making summary | «Делаю…», elapsed time and Отменить over the skeleton |
| Calls — inactive window | The selected row turns grey (`btn`) |
| Calls — no selection | «Звонок не выбран» |
| Calls — renaming | The title is a field; the `yyyy.MM.dd-HHmm` prefix stays fixed. Return saves, Esc cancels |
| Calls — confirm delete | The Glass Ledger Sheet over the window: Удалить and Отмена |
| Calls — error | A banner pinned to the bottom of the list |
| Calls — search | «correlation»: transcript and summary matches, one selected |
| Calls — searching | Transcripts still being read: spinner in the field, rows so far |
| Calls — search, no results | One centred message naming the query |
| Calls — empty, Calls — loading | One centred message in the list |
| Calls — narrow | 560 pt: the list alone |

## Tokens

Every colour, font, type size, gap, padding and radius is a Glass Ledger
token; the only raw colours are the window's traffic lights and the
transparent menu-item fill. Running text uses line height 1.54, which is
`line-body` 20 on `type-body` 13; the file's line height is a multiplier,
so the token cannot be bound. Fixed sizes with no token are layout widths:
list 340, window 1100 and minimum 560, skeleton bars 8 high (a height
cannot bind `space-8`) and 640–300 wide, time 40, duration 48, icons 14 and
20, search field 160, menu 240, alert 340.
