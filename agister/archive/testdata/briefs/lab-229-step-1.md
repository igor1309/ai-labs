# LAB-229 step 1: the document vocabulary moves to internal/domain/document

## Goal

`testdata/briefs/lab-229-goal.md`

## Covers

- 1, 2, 3, 4, 5: the whole goal.

## Constraints

- The change is a move: change no logic, no message and no comment's meaning. A comment that names `definition.X` for a moved X names `document.X`.
- Documents that cite a moved name by package (`README.md`, `docs/`, ADRs excepted: an ADR is a record and is not edited) are updated to the new package.
- Do not commit.

## Open

None.
