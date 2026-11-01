# LAB-118 review round 3: fix

## Goal

`agister/testdata/briefs/lab-118-goal.md` (Intent: nothing is found by
searching runs; Done when 6).

## Answers

The judgement of `code_review` workflow run `20261007T100517Z-c79064`
(base `22ed021f`, candidate `438ba2da`), its one `fix` item, as written.

## Acts on

1. **Link tests do not prove runs are never searched.** Action: Add a
   `ListStrict` call counter, or set the spy's `listErr` sentinel, in the
   link tests in `agister/internal/app/links_test.go`, and assert that
   explicit links use `Get` only.

## Constraints

Change nothing else. No production code change.

## Open

None.
