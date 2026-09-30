# LAB-15 round 2: review fixes to the clean-copy verification

Commit 1601f9b0 gave each call one clean copy at a path recorded before it
exists (`agister/docs/adr/005-verify-on-a-clean-copy.md`). Fix each item
below, each with a regular test that fails without the fix.

## A refused copy must not delete what was already there

Case: `kept.txt` already sits at `Workspaces.Place(record.ID)` (the fixture
of `TestACopyIsNotMadeWhereSomethingIs`). `claimCopy` records the path
(`internal/app/verify.go`), `removeCopy` is deferred before `Copy` runs,
`Copy` refuses the existing directory (`internal/adapters/git/git.go`),
and the deferred `Discard` removes it with `os.RemoveAll`.

Let the copy contract tell "refused: something is already there" apart
from "failed after it was made". On a refusal, drop the path from the
record and discard nothing; the call fails. Test at the verifier level
against an occupied place: `kept.txt` survives, and the path is no longer
on record as this call's copy.

## A failed removal ends the call at once

Today, when removing an attempt's copy fails after a failed run, the
repair turn still runs and is paid for, and only the next attempt finds the
copy still on record and fails. Instead, the call fails as soon as the
removal fails: no repair turn starts. The record keeps the failed attempt
(its patch and run), the removal error and the copy for the reap. Test: the
run exits 1, removal returns "busy"; no repair turn is taken, the call
fails, the copy is on record.

## Tests

- Preparation that ends only because its deadline expired: e.g. a `Copy`
  spy that blocks until its context is done. Assert that preparation is
  interrupted, the call ends as `timeout` with its message, no command
  runs, and the copy is cleaned up. Add only the seams this needs.
- `code_review` keeps its ADR review: a regular test with a fixed expected
  set of reviewers, asserting the judge's collection includes the ADR
  review and that `adr_review_codex` gets `prompts/code-review-adr.md`.
  It fails if the `adr` entry in `.agister/workflows/code_review.yaml` is
  removed.

Do not change ADR files.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
