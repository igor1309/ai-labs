# Call tags

Tags in the calls window (LAB-1617). The owner picked this variation over
chips in each row and a search-only design. Frames are the "Calls — …"
tag screens in `visual-language.pen` (frame index); parts are Tag chip,
Tag chip/On, Row tag, Tag strip and Tags line; the Two-line row has a
hidden Tags slot on the "Calls window — components" board.

## Storage

- A call's tags are `tags.txt` in its folder, one tag per line, written
  by the user. No tags are suggested or made automatically.
- Read trimmed, with empty lines dropped; two tags that differ only in
  case or ё/е are one, shown as first written.
- Merging calls gives the merged call every part's tags.

## Filter strip

- A row of tag chips under the search field, across the list's width,
  listing every tag in use, most used first; it scrolls sideways and is
  hidden when no call has tags.
- Clicking a chip turns it on (`me` fill, white text); the list shows only
  calls that have every chip that is on. Clicking it again turns it off.
- Days keep their shape: a day shows only its calls that pass, with their
  count, and days with none are hidden, as in search.

## `#tag` in the search

- A `#word` in the search field turns the chip of that tag on, and the
  rest of the query searches as today. Esc clears both.
- A tag also counts as a match for plain search, like a title, so it
  shows before transcripts are read.

## Editing

- The detail header has one meta line under the date: «Шаблон: <name>»,
  a `·` divider, then «Теги:», the call's tags and «Изменить». Labels are
  `sub`, the template name is `text`, so it reads a step above its label;
  both share `type-small`. The template comes first, so its place does not
  move as tags grow (Template and tags line).
  «Изменить» turns the line into a field, one chip per tag, with a
  `+ тег` entry that completes from tags in use. Return saves, Esc cancels.
- A row shows its tags as `#tag` text (Row tag: `type-small`, `gutter`,
  no box, the gist's baseline) at the end of the
  gist line; the gist truncates before them. A call without tags shows none.

## States

| Frame | What it shows |
|---|---|
| Calls — tags filter | Strip with one chip on, list filtered |
| Calls — #tag search | `#клиент` in the field, its chip on |
| Calls — editing tags | Template stays; the tags part of the line becomes a field |
| Calls — no tags | No strip; detail shows «Шаблон: Default · Теги: нет · Добавить» |
