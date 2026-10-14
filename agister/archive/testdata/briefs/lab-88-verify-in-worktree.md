# Verification may run in the caller's worktree (LAB-88, part 2 of 3)

Implement ADR-022 rule 6 and its ADR-010 amendment. Read
`docs/adr/022-a-call-may-work-in-the-callers-worktree.md`. Part 1, the
fresh in-place call, is already on this branch.

## Wanted

- **Definition.**
  - A verification, both the inline `verify` block and a `verifies/<name>.yaml` document, may hold `where: workspace`. It is optional, and `workspace` is its only value. Any other value is a problem `check` reports.
  - Include it in the definition's digest.
  - `agister process show` prints it.
- **Where the command runs.** An **in-place** call whose verification declares `where: workspace` runs each attempt's command in the caller's worktree, not in a clean copy:
  - no copy is claimed, made or recorded;
  - no ADR-008 lock is taken;
  - the per-worktree lock of part 1 is still held.

  Every other call verifies on a clean copy exactly as now. That includes a call in a checkout of its own, whose verification declares `where: workspace`.
- **ADR-002 rule 7 in the worktree.**
  - The content identity is taken before and after each command run. A run that changes it fails, as on a copy.
  - The patch captured at the end must rebuild the content that passed: identity from the revision plus the patch equals the identity verified. Ignored files (build output, test results) are not content and are never removed.
- **Record.** The run's in-place workspace record (part 1) gets the verification mode (`workspace` or `copy`), and each attempt says where it ran.
- **Repair** (ADR-002 rule 4) is unchanged: a failing command goes back to the same session, in the worktree.

## Tests (committed, fakes at seams; no mutation checks)

- Parsing:
  - `where: workspace` is accepted inline and in a document;
  - a bad value is reported;
  - the digest changes with `where`.
- An in-place call with `where: workspace`:
  - the verify command's directory is the worktree;
  - the copy seam is never called;
  - an ignored file the agent made before the command is visible to it, and survives;
  - a pass completes;
  - the record says `workspace`.
- An in-place call without `where` still verifies on a copy.
- A temporary call with `where: workspace` still verifies on a copy.
- A command that changes tracked content in the worktree fails that attempt.
- A failing command is repaired in the same session and the same worktree.

## Out of scope

Continuation in-place, the caller skill, the README.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
