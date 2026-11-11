# Calls list — design directions

[calls-list.pen](calls-list.pen) draws three directions for the calls list,
each at a wide (900) and a narrow (440) window, light and dark (the dark
frame is an instance of the light one with `theme: {mode: "dark"}`). Its
tokens are the ones in [tokens.json](tokens.json); the components sit on the
"Components" board.

All three share:

- Fixed row height at every width. The title is one line and truncates with
  an ellipsis; status never adds a line.
- No reserved action column. Actions are in a context menu (Открыть,
  Показать заметки, Переименовать, Повторить итоги, Показать в Finder,
  Удалить…), on keys (Return opens, Space shows notes, ⌘R renames, ⌘⌫
  deletes) and in one ⋯ button that appears on hover inside the status cell.
- A status cell with icons: summary pending (spinner), summary failed (red
  alert), notes (eye, accent when previewed).
- Retry summary moves from a link under the title to the context menu. The
  footer hint about renaming is removed.

| Direction | Row | Narrow window | Trade-off |
|---|---|---|---|
| A — Dense table | One line, ~32 pt: date, title, duration, status; sortable header | Duration drops, date shortens to dd.MM | Most native (Finder / `Table`); date column costs title width |
| B — Two lines (Mail) | ~48 pt: title + relative time; duration and summary state as words | Unchanged | Readable status, works at any width; about a third fewer rows per screen |
| C — By day (Notes) | ~28 pt: time, title, duration, status under day headers | Duration drops | Most title width and density; chronological order only |

Open:

- Which direction, or a mix (for example A wide switching to B's row when
  narrow).
- Whether the list needs search or column sorting at all.
- The narrow breakpoint and the window's minimum width.
