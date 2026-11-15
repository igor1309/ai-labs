# Agents file — QA

Unit rows run against a fresh temporary recordings root, never the user's
own, and check it from outside with `FileManager`. The Settings rows run
the General view model with the writer given that root. A live run of
Settings (`macos/scripts/`) proves the row and button end to end.

## S-1 Offered while the file is missing

An empty root; General's state holds the agents row. Snapshot matches the
`general-agents-missing` frames in light and dark.

## S-2 Creating the file

Pressing the button writes `AGENTS.md` whose bytes equal the fenced block
in `docs/agents-md.md` (read from the doc in the test, so the two cannot
drift), mode `0600`; the row is gone from the state.

## S-3 Not offered while the file exists

A root with any `AGENTS.md`, empty included; no row.

## S-4 My own AGENTS.md is kept

A root with an `AGENTS.md` holding `mine`; after General is shown and a
press is forced through the writer, the file still holds `mine`. The
writer never replaces an existing file (create-exclusive).

## S-5 Never written without me

The calls-window live script records, tags, merges and summarizes a call
and relaunches; the root has no `AGENTS.md`. Grep proves only the
General button calls the writer.

## S-6 Offered again after I delete it

Write the file, delete it with `FileManager`, show General again; the row
is back.

## S-7 A failed write is explained

A read-only root; the press fails, the hint reads "Couldn't create
AGENTS.md: " and the system's reason, no file or temporary is left, and
the button is enabled. Making the root writable and pressing again
writes the file and hides the row.

## S-8 Not offered without a recordings root

The root removed; no row, and nothing is created.

## Layout check

A test builds a call folder with the real writers (`CallFolder`,
`TagsFile`, `SummaryFiles`, a merge) and asserts every file name the doc
lists exists where it says, so a renamed file fails the build.
