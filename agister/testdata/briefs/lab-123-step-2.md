# LAB-123 step 2: a status probe is not an owner

## Goal

`agister/testdata/briefs/lab-123-goal.md`

## Covers

- Done when 1 and 3, as the owner's decision on item 1#1 (the goal's
  Decisions) requires.

## Acts on

The judgement of `code_review` workflow run `20261007T213927Z-21fb29`,
its `owner` item 1#1, decided (a), as written:

Make adoption in fsruns aware of readers so it tells shared readers from
an exclusive owner, allow bounded recovery once transient readers release
their locks, keep export protection, update the ownership and export
tests, and add a deterministic test that holds a status probe during
recovery.

## Constraints

- An exclusive owner still refuses at once, and a run that `runs export`
  holds is still protected. The wait for transient readers is bounded
  within the reap's deadline, and its clock is a seam: no real sleeps in
  tests.
- Every process that reads or takes the owner lock keeps working with
  runs recorded before this change.

## Open

None.
