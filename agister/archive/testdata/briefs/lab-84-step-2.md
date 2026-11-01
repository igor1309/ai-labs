# LAB-84 step 2: ADR-027 keeps the `.agister/` copies

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 1 and 3, in the ADR only: revise ADR-027 (still Proposed) to
  the owner's decision of 2026-10-07 in the goal's Decisions.

## Constraints

- Change only `agister/docs/adr/027-homes-settings-have-one-source-in-git.md`.
- Rule 6 and every rule, consequence and alternative that follows from it
  change: `.agister/` keeps its full settings; a repository test fails
  when a document `.agister/` shares with `agister/home/` (same kind and
  name) differs, unless it is listed in the test with its reason (such
  as this repository's wording in `advisor.md` or `advice.json`). Decide
  how `.agister/`'s processes take their prompts so that they can be
  identical to the folder's (rule 4), and say where `.agister/`'s copies
  of the eight prompts live.
- The rejected alternative "Keep `.agister/`'s copies and test them
  identical" becomes the decision; the removed rule 6 becomes the
  rejected alternative, with the owner's reason: the repository must
  work without home installed.
- Keep the rest as it is.

## Open

None.
