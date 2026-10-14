# LAB-84 step 4: ADR-027 holds one copy of each document

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 1 and 3, in the ADR only: revise ADR-027 (still Proposed) to
  the owner's last decision of 2026-10-07 in the goal's Decisions.

## Constraints

- Change only `agister/docs/adr/027-homes-settings-have-one-source-in-git.md`
  and, where it says which copy `.agister/` takes,
  `agister/testdata/briefs/lab-84-inventory.md`.
- Bring back the first proposal's rule 6, as commit `b197dcc4` has it:
  `.agister/` keeps only the repository's own documents, every other
  shared document is removed from it, and a test fails when `.agister/`
  holds a document the folder holds unless it is listed with its reason.
  Bring back what follows from it in the rules, consequences and
  alternatives, with the owner's reason from the goal; "keep `.agister/`'s
  copies and test them identical" is again a rejected alternative.
- Keep the fixes of step 3 (enduring Context, the narrowed consequence on
  verification) and everything else.

## Open

None.
