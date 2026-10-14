# A continuation in-place resumes in the same worktree (LAB-88, part 3 of 3)

Implement ADR-022 rule 8. Read
`docs/adr/022-a-call-may-work-in-the-callers-worktree.md` and ADR-013.
Parts 1 and 2 are on this branch. Part 1 refuses `--continue` in-place
with a "not supported yet" reason; replace that refusal.

## Wanted

- **Session.** Keep ADR-013's choice of the session's latest run and all of its refusals (unfinished or overlapping runs; the session advancing before the first turn).
- **Admission.** Instead of carrying the patch, a continued in-place call is refused, each case with its own reason, unless:
  - the latest run worked in-place, in the same worktree (canonical identity), repository and revision. A latest run that worked in a temporary checkout is refused, and so is the reverse, a temporary continuation of an in-place run: a session never switches modes;
  - the latest run's `changes.patch` still matches the digest it recorded, or it recorded `NO_CHANGES`. A run whose capture failed (`ARTIFACT_FAILED`, or no identity recorded) is refused;
  - the worktree's content identity equals the identity the latest run recorded. Check this even when that run had no changes;
  - HEAD is the revision.

  These checks run under the per-worktree lock, together with part 1's writer checks. The precheck runs as for a fresh call, and is followed by the identity check against the **expected** content, not against the revision.
- **Nothing is applied.** The carry/apply path of ADR-013 is not used in-place.
- **Patch.** The new run's `changes.patch` is still cumulative from the revision, with its identity recorded.
- **Resume where it ran.** `whereItRan` (`calls.go`; Pi and OpenCode) refuses every checkout process today. It must accept an in-place continuation whose worktree is the directory the latest run worked in, and refuse any other directory.
- **Notice.** The continuation notice (`domain/prompt` `Continues`) says the session's changes are already in this worktree, uncommitted. It does not say the earlier directory is gone.

## Tests (committed, fakes at seams; no mutation checks)

- A matching tree is admitted, and no patch is applied (apply spy not called).
- Refusals:
  - a tree that drifted from the recorded identity;
  - a different worktree;
  - a different revision;
  - HEAD moved;
  - a temporary-checkout latest run;
  - a temporary continuation of an in-place run;
  - a patch digest mismatch;
  - a latest run whose capture failed.
- An empty latest patch (`NO_CHANGES`) with an unchanged tree is admitted.
- The latest run, not the run named, decides the expected identity.
- A runtime that resumes only where it ran:
  - same worktree is admitted;
  - another directory is refused.
- The notice text names the run continued and says the changes are already in the worktree.

## Out of scope

The caller skill and the README (a later docs run).

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
