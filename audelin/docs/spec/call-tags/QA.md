# Call tags — QA

Unit rows run against a fresh temporary calls folder, never the user's
own, and check files from outside with `FileManager`. The live run of the
calls window (`macos/scripts/live-calls-summary.sh`) proves the strip and
editing end to end.

## S-1, S-2 Tagging and removing

Recordings sets a call's tags to `клиент, банк`, then to `клиент`; its
`tags.txt` holds those lines, and the reloaded list shows them.

## S-3 Tags kept across restarts

A `tags.txt` written by hand is read on listing; empty lines and spaces
are dropped.

## S-4, S-5 Filtering

CallTags keeps only calls having every chosen tag: one chosen tag keeps
two of three calls, two keep one.

## S-6 A tag typed in the search

`#клиент бюджет` splits into the tag `клиент` and the text `бюджет`.

## S-7 Searching finds a tag

A call whose only match is its tag `бюджет` is found with a tag match
and no title ranges.

## S-8 Tags differing in case are one

`Клиент` and `клиент` are one tag, as are `ёж` and `еж`, shown as
first written.

## S-9 A merged call keeps its parts' tags

Merging calls tagged `клиент` and `найм` leaves the merged call with
both; a failed merge writes no tags.

## S-10 No filter without tags

With no `tags.txt` in any call, the strip's tags are empty.

## Review rows

- **Merge tag failure:** a TagsFile write failing in the merge's write
  step leaves no merged call, every part back in place with its own
  `tags.txt`, and the merge reported failed.
- **Tag-only search:** a call matched only by its tag `бюджет` is found
  with a tag match and no title ranges.
- **Stale read:** a list answer older than the latest request, arriving
  after a save, is ignored; the saved tags stay shown.
- **Failed save after moving selection:** a save that fails after the
  selection moved shows the failure for the edited call, with its draft.
- **External edit:** a `tags.txt` changed outside the app shows after a
  refresh; an unreadable one shows as unreadable, an absent one as no tags.
- **Same-payload late outcome:** submit `A`, then `B`, then `A` again; the
  first `A`'s outcome arriving last is ignored and the latest stays pending.
- **Editing during a pending save:** while one call's save is pending,
  editing another call is unavailable; a failure then shows with its draft.
- **Snapshot between save and reload:** a list answer requested before a
  successful save, arriving before the fresh list, is ignored.
- **Unreadable part tags on merge:** an unreadable part `tags.txt` fails the
  merge before publication with every part back in place.
