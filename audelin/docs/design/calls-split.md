# Calls window — list and summary

[calls-split.pen](calls-split.pen) draws the calls window: the calls list on
the left and the selected call's summary on the right, Mail-style. It
replaces the calls list window and the floating summary panel. Tokens and
shared parts come from the calls list; the window's own parts are on the
"Split components" board (List bar, Detail bar, Two-line row, Two-line
match row, Detail header, Section, Subhead, Paragraph, Bullet, Detail
message). Each screen is a light component with a dark instance.

## Layout

- List 340 pt, divider 280–420, kept across restarts. Below 700 pt the
  detail hides and the list fills the window; Return or Space opens the
  summary in its own window.
- Row, two lines: title and start time; then duration and the gist, the
  first sentence of «О чём встреча». Preparing: «Подготовка итогов…» and a
  spinner. Failed: «Не удалось подготовить итоги» in `rec` and the alert.
  No summary: the second line holds only the duration. An untitled call
  shows its folder name in `font-data`, `gutter`.
- Day headers, ordering, row menu and keys are those of the calls list.
  Inactive window: the selection turns `chip`.

## Detail

- Header: title, then day, start time · duration. The summary is
  selectable rendered Markdown. Toolbar: Копировать (the Markdown source)
  and ⋯ with the row menu.
- Without a summary, one centred message under the header: preparing;
  failed, with the error and Повторить итоги; «Итогов нет» when notes are
  off. No selection: «Звонок не выбран». Копировать and ⋯ are hidden
  whenever there is no summary.
- ↑↓ moves the selection and the detail follows at once; Tab moves focus
  into the detail. No transcript in this window.

## Search

- The field is in the list's title bar and works as in the calls list.
- A match row keeps two lines: title and time, then where the first match
  is (transcript time, or «Итоги»), the text around it with the hit in
  `hit`, and «ещё N». The detail shows the selected call's summary.
- No results: the list says so and the detail shows «Звонок не выбран».
  Empty and loading are the calls list's messages, in the list pane.
