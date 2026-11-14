# Calls window

The "Calls — …" frames in [visual-language.pen](visual-language.pen) draw
the calls window: the calls list on the left and the selected call's summary on the right, Mail-style. It
replaces the list window and the floating summary panel. Each screen is a
light component with a dark instance (`theme: {mode: "dark"}`); the tokens
are the file's variables. Shared parts are on the
"Calls window — shared components" board (Title bar, Search field, Day
header, Context menu); delete, rename and errors use the Glass Ledger
Sheet, Rename field and Banner/Error; the window's own parts on the "Calls window —
components" board (Detail bar, Tooltip, Two-line row, Two-line match row, Detail
header, Section, Subhead, Paragraph, Bullet, Detail message, No summary
line, Link/Make, Making line, Summary skeleton, Summary date). Each row state
is its own component on that board, an instance of its row holding the
state: Row/Selected, Row/Inactive selected, Row/Preparing, Row/Failed,
Row/Untitled and Match row/Selected. Screens use these and override only
content; a selected row that is also preparing, failed or untitled adds
that state's overrides to Row/Selected.

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
- Row, a ledger line: the start time (HH:mm, `font-data`) leads in its own
  40 pt column, so a day reads as a schedule. Beside it, two lines: the
  title with the duration (`type-caption`, `gutter`) on the right; then the
  gist, the first sentence of the summary's «О чём встреча». Each line
  truncates with an ellipsis; every row has the same height. Rows have no
  dividers.
- Selection is a quiet `okBg` tint with a 4 pt `me` bar on the leading edge
  and the time in `me`; the text keeps its own colours.
- Preparing: the gist line says «Подготовка итогов…» in `gutter` with a
  spinner. Failed: «Не удалось подготовить итоги» in `rec` with the alert.
  No summary: the second line is empty. An untitled call
  shows its folder name in `font-data`, `gutter`.

## Detail

- Header: title, then day, start time · duration. The summary is
  selectable rendered Markdown (headings, lists, code, tables). The
  header sits in the toolbar band, level with the window controls, and
  stays while the summary scrolls below it. Under the summary's last
  line, the date it was made in `gutter`, `type-caption`
  («Сделано 12 ноября, 14:05»).
- Toolbar: one bar across the window. Over the list, the title and the
  selected call's own actions, which act on the row: Открыть (its folder
  in Finder) and Переименовать in one Mail-style group, Удалить… alone.
  Each shows its name as a tooltip on hover (Tooltip on the components
  board). There is no ⋯ menu.
- The toolbar has no bar over the detail: the summary's surface runs to
  the window's top edge, under the header.
- Копировать belongs to the summary, not the call: an icon button in the
  summary's top-right corner, level with the row actions, fixed while the
  text scrolls (Copy overlay on the components board). It shows only while a
  summary is shown and copies its Markdown source.
- With no call selected the row actions are disabled, never hidden, so the
  bar does not shift. Повторить итоги stays in the failed message and the
  row's context menu. Below 700 pt the bar is the same and acts on the
  selected row; the call's own window has the row actions in its toolbar
  and Копировать over its summary.
- No summary: one line under the header, «Нет итогов» in `gutter` and the
  link «✨ Сделать» in `me`.
- Making, or preparing after a call: the line becomes a spinner, «Делаю…»
  and «Отменить» in `sub`, over a grey skeleton of the summary (`btn`
  bars). Another call may be selected meanwhile; the row keeps the
  spinner. On completion the summary replaces line and skeleton; Отменить
  returns to the no-summary line.
- Failed: one centred message under the header, the error and Повторить
  итоги. With no call selected: «Звонок не выбран».
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

- The search field is the list's first row, under the bar, across the
  list's width. ⌘F focuses it; Esc or its
  clear button empties it and the whole list returns.
- One field searches titles, summaries and transcripts as you type, ignoring
  case and ё/е. There is no scope switch.
- Results keep the list's shape. A day shows only its matching calls and
  their count; days with no match are hidden.
- A match row keeps the time column and two lines: the title, then where the first
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
| Calls — preparing | After a call: «Делаю…» over the skeleton, as making |
| Calls — summary failed | The error and Повторить итоги |
| Calls — no summary | «Нет итогов» and the link «✨ Сделать» |
| Calls — making summary | «Делаю…» and Отменить over the skeleton |
| Calls — inactive window | The selected row turns grey (`btn`), its bar `gutter` and its time `sub` |
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

## Merge mode

- «Объединить звонки…» (combine icon) leads the list bar's actions, before
  Открыть and Переименовать. It turns the list bar into the Merge bar:
  «Объединение», «Готово», which leaves merge mode (Escape too), and
  «Объединить N», which counts the marked calls.
- Every row shows a mark before its time: an empty circle in `gutter`, or a
  checked circle in `me` when marked (Row/Unmarked and Row/Marked; a
  preparing, failed or selected row adds the mark to its own state). A click
  marks or unmarks; the selection and the detail stay as they were.
- Below two marked calls the merge button is disabled (`dis`, `disText`)
  and still counts. Narrow, the bar and marks are the same over the
  full-width list.
- Frames: «Calls — merge mode», «… one marked», «… narrow», with dark
  instances.
- Open: whether the row actions stay visible, disabled, in merge mode.
