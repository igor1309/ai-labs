# LAB-84 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 2 and 3, and the goal's Out of scope, as the fix items below
  require.

## Acts on

The judgement of `code_review` workflow run `20261007T193543Z-b1ee93`
(base `origin/trunk`), its three `fix` items, as written:

1. **Restore skips an empty skill folder left by a failed skill write** (3#1). Plan cleanup for an install-created skill folder even when its document is absent, make that cleanup tolerate an entirely absent folder, and add a committed regression test using a temporary home and backup.
2. **AGENTS.md post-merge rule assigns the owner's initial LAB-84 install to the agent** (5#1). Qualify the paragraph at agister/AGENTS.md:79-86 with an exception preserving LAB-84's owner-run initial installation; no code or new test.
3. **Home-folder test inventories the source through files(), which filters out backups and the log** (2#1). Use an unfiltered source inventory, or assert that Source reports no ignored entries, and cover the guard with a t.TempDir fixture containing a backup file.

## Constraints

- Item 4#1 of the same judgement (whether the edits to recorded agent
  instructions stand) is with the owner: leave those edits as they are.

## Open

None.
