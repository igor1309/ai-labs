# Calls split view — brief

[calls-split.pen](calls-split.pen) draws two variations of one window that
holds the calls list and the selected call's detail, Mail-style. It would
replace the list window plus the floating summary panel. Tokens and the
shared parts come from the calls list; the new parts are on the "Split
components" board. Each variation is a light component with a dark instance.

## Split A — list and summary

- List column 340 pt (resizable 280–420), 32 pt one-line rows: time, title,
  status. Duration moves to the detail header.
- The detail shows the summary as rendered Markdown. The toolbar holds
  Копировать (Markdown source) and ⋯ (Открыть в Finder, Переименовать,
  Повторить итоги, Удалить…).
- ↑↓ updates the detail at once; Tab moves focus into the detail.

## Split B — rows with gist, transcript tab

- Two-line rows (~48 pt): title and time, then duration and a one-line
  gist; «Подготовка итогов…» or a red «Не удалось…» when there is none.
- The detail toolbar switches Итоги | Транскрипт (⌘1, ⌘2). A timestamp in
  the summary jumps to that transcript line.

## Both

- Below 700 pt the detail hides and the list fills the window; Return opens
  the summary in its own window.
- The divider position is kept across restarts. Search stays above the
  list; the detail follows the selection.

## Open

- Where the gist comes from: a field in `summary.md` or its first sentence.
- Whether search hits open the transcript tab at the match.
- Not drawn: no selection, a call without summary, search, narrow width.
