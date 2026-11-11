# Calls list

[calls-list.pen](calls-list.pen) draws the calls list: calls grouped by day,
newest first. Each screen is a light component with a dark instance
(`theme: {mode: "dark"}`); the tokens are those in [tokens.json](tokens.json),
and the parts are on the "Components" board (Title bar, Search field, Day
header, Row, Match row, Context menu, Alert, Rename field, Error banner).

## Layout

- No sorting and no column header. Days run newest first, calls within a
  day newest first.
- Day header: Сегодня, Вчера; then weekday and date within the last 7 days
  (Пятница, 7 ноября); older days the date (3 сентября), with the year only
  when it is not the current one (12 декабря 2025). It shows the day's call
  count.
- Row, 32 pt: start time (HH:mm, `font-data`), title, duration
  (right-aligned, 64 pt), status cell (64 pt). An untitled call shows its
  folder name in `font-data`, `gutter`.
- The title is one line and truncates with an ellipsis. Nothing in a row
  wraps, so every row has the same height.
- The window's minimum width is 560 pt. Every column shows at every width;
  at the minimum the title keeps about 330 pt.

## Status and actions

- Status cell, right-aligned: summary being prepared (spinner), summary
  failed (red alert), notes (eye; accent only on the selected row while the
  window is active, `sub` otherwise; a click shows the notes).
- Hover changes nothing in a row. A right-click selects the row and opens
  its menu at the pointer, so the menu always acts on the selected call:
  Открыть, Показать итоги, Переименовать, Повторить итоги (only when the
  summary failed), Удалить…. Открыть shows the call's folder in Finder.
- Keys: ↑↓ select, Return opens, Space shows notes, ⌘R renames, ⌘⌫ asks to
  delete. Double-click opens.

## Search

- The title bar holds the window title at the left and a 200 pt search
  field at the right, on every screen. ⌘F focuses it; Esc or its clear
  button empties it and the whole list returns.
- One field searches titles, summaries and transcripts as you type, ignoring
  case and ё/е. There is no scope switch.
- Results keep the list's shape: days and calls newest first, one-line
  32 pt rows. A day shows only its matching calls and their count; days
  with no match are hidden.
- A Match row shows the title, then one snippet: where the first match is
  (its time in the transcript, or «Итоги»), the text around it, and
  «ещё N» for further matches. The snippet takes the space the title leaves
  and ends with an ellipsis; «ещё N» goes first when space runs out, then
  the title truncates.
- Every match, in the title and in the snippet, is marked with `hit`.
- While transcripts are still being read, the field shows a spinner and the
  list ends with «Ищу в расшифровках…»; rows join as they are found.
- With no match, one centred message names the query.
- Selection, the eye, the context menu and the keys work as in the full
  list.

## States

| Frame | What it shows |
|---|---|
| Calls — wide | 900 pt, a failed row selected by a right-click with its menu open |
| Calls — minimum width | The same at 560 pt |
| Calls — renaming | The title cell is a field; the `yyyy.MM.dd-HHmm` prefix stays fixed. Return saves, Esc cancels |
| Calls — confirm delete | A sheet over the list with Удалить and Отмена |
| Calls — error | A banner pinned to the window's bottom |
| Calls — window inactive | The selected row turns grey (`btn`) and its eye `sub` |
| Calls — empty, Calls — loading | One centred message |
| Calls — search | 900 pt, «OKR»: title, transcript and summary matches, one selected |
| Calls — search, minimum width | The same at 560 pt, snippets truncated |
| Calls — searching | Transcripts still being read: spinner in the field, rows so far |
| Calls — search, no results | One centred message naming the query |

## Tokens

Every colour, font, type size, gap, padding and radius is a Glass Ledger
token; the only raw colours are the window's traffic lights and the
transparent menu-item fill. Fixed sizes with no token are layout widths:
time 40, duration and status cells 64, icons 14, search field 200, menu 240,
alert 340, minimum window 560.
