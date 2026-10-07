# LAB-118 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-118-goal.md` (Done when 2 and 6).

## Answers

The judgement of `code_review` workflow run `20261007T095551Z-40192a`
(base `22ed021f`, candidate `e865fe46`, the same tree as `e7417e73`), its
`fix` items 2#1 and 1#1, as written. Its item 1#2 (remove the committed
review brief) is not acted on: stopping the commit of briefs is a later
decision, after this lands (`lab-117-goal.md`, Out of scope), and the
installed Agister does not yet keep a long brief's text.

## Acts on

1. **Artifact-link expectations alias the source artifact.** Action:
   Strengthen the fixture in `agister/internal/app/links_test.go` so the
   process and workflow tests compare against independent artifact
   metadata: give the expected artifact its own value copy before
   submitting the call.
2. **Inline list inputs cannot be linked as goals.** Action: Extend
   `Calls.goal` in `agister/internal/app/links.go` to accept the supported
   inline list representation, including JSON-decoded arrays, using its
   recorded content digest. Add a regression test in `links_test.go` for a
   stored list input named by `--goal`.

## Constraints

Change nothing else.

## Open

None.
