# LAB-84 step 6: `agister/home/` is home's source; `.agister/` keeps its own

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 3 and 4: ADR-027 rules 1 to 7 and 10, and its consequences
  for this repository (the repository tests, the CI path filter,
  `agister/AGENTS.md`'s home-settings step).

## Constraints

- What the folder starts with, and which copy of each differing
  document is current: `agister/testdata/briefs/lab-84-inventory.md`,
  with `~/.agister/` and this repository's `.agister/` as they are now.
  Read `~/.agister/`; do not write to it.
- Move the eight prompts with `git mv`, so their history follows.
- The repository's `.agister/` must still pass `agister check` from this
  repository (composed with the real home, as it is today), and
  `agister check` on the folder as global settings must pass with this
  binary.

## Open

None.
