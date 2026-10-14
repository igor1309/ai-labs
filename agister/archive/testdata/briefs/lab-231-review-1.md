# LAB-231 review 1: the checked counts for failed reads and parses

## Goal

`testdata/briefs/lab-231-goal.md`

## Covers

- 3, 6: the checked counts stay the Checker's and are unchanged.

## Acts on

Code review run `20261012T214727Z-8fd862`:

- 2#1 (minor, fix): no test asserts that a failed read leaves the Checker's checked counts as they were. Add a Checker-level table test over the existing `definitions` seam, with explicit port responses, that covers a document that reads and parses, one whose read fails and one whose parse fails, across the kinds of document, and asserts the resulting checked counts.

## Constraints

- Tests only, in one Checker test file: change no production file.
- The expected counts are what `check` gives today; if a count looks wrong, report it under Open rather than change it.
- Do not commit.

## Open

None.
