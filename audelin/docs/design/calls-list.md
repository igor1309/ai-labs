# Calls list

[calls-list.pen](calls-list.pen) draws the calls list: calls grouped by day,
newest first. Each screen is a light component with a dark instance
(`theme: {mode: "dark"}`); the tokens are those in [tokens.json](tokens.json),
and the parts are on the "Components" board (Title bar, Day header, Row,
Context menu, Alert, Rename field, Error banner).

## Layout

- No sorting and no column header. Days run newest first, calls within a
  day newest first.
- Day header: Сегодня, Вчера; then weekday and date within the last 7 days
  (Пятница, 7 ноября); older days the date (3 сентября), with the year only
  when it is not the current one (12 декабря 2025). It shows the day's call
  count.
- Row, about 28 pt: start time (HH:mm, `font-data`), title, duration
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
- Hover tints the row and shows a ⋯ button at the end of the status cell,
  in no extra space. It opens the same menu as a right-click, below the
  button with right edges aligned: Открыть, Показать заметки, Переименовать,
  Повторить итоги (only when the summary failed), Удалить…. Открыть shows
  the call's folder in Finder.
- Keys: ↑↓ select, Return opens, Space shows notes, ⌘R renames, ⌘⌫ asks to
  delete. Double-click opens.

## States

| Frame | What it shows |
|---|---|
| Calls — wide | 900 pt, selected row, hovered failed row with its menu open |
| Calls — minimum width | The same at 560 pt |
| Calls — renaming | The title cell is a field; the `yyyy.MM.dd-HHmm` prefix stays fixed. Return saves, Esc cancels |
| Calls — confirm delete | A sheet over the list with Удалить and Отмена |
| Calls — error | A banner pinned to the window's bottom |
| Calls — window inactive | The selected row turns grey (`btn`) and its eye `sub` |
| Calls — empty, Calls — loading | One centred message |

## Tokens

Every colour, font, type size, gap, padding and radius is a Glass Ledger
token; the only raw colours are the window's traffic lights and the
transparent menu-item fill. Fixed sizes with no token are layout widths:
time 40, duration and status cells 64, ⋯ button 20, icons 14, menu 240,
alert 340, minimum window 560.
