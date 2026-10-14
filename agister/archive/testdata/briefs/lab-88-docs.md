# Document the in-place workspace (LAB-88, docs)

ADR-022 (`docs/adr/022-a-call-may-work-in-the-callers-worktree.md`) is
implemented on this branch: parts 1 to 3. Document it for the people and
agents who run Agister. Write in the style each file already uses. Describe
only what the binary does now: read the code and `agister --help`, and do
not copy the ADR.

## Wanted

1. **`skills/agister/SKILL.md`**, the caller skill. LAB-88 requires this
   update. Cover, in the sections that fit (Run, What a repository
   provides, Verification, Apply a run's changes, Continue a run, Rules):
   - `--workspace in-place|temporary`, and `workspace.yaml` `mode:` as
     the repository's default, which the flag overrides. In-place applies
     only to a process with a checkout, and never to a workflow.
   - What in-place refuses before any turn: a tree that is not clean,
     HEAD ≠ the revision, a failing `precheck`, a worktree another run
     holds or may still write in. Give the reason a caller should expect.
   - `precheck` in `workspace.yaml`. `setup` does not run in-place.
   - The changes stay in the worktree, uncommitted. **Do not apply
     `changes.patch` again** in-place: it is the record. A failed,
     timed-out or interrupted call leaves its changes in the tree too, and
     an agent's commit fails the call and stays.
   - Verification: `where: workspace` makes an in-place call verify in
     the worktree. A pass then proves the worktree, ignored files
     included, not the patch alone. Everything else verifies on a clean
     copy.
   - `--continue` in-place: same worktree and revision; the tree must
     still hold exactly what the latest run left; nothing is applied.
   - The rule that in-place is cooperation, not confinement: do not
     change the worktree while the call runs.

   `cmd/agister/caller_skill_test.go` checks that every command and flag
   the skill names exists. Keep it passing.
2. **`README.md`**:
   - add ADR-022 where the ADRs are listed or cited;
   - document `--workspace`, the `workspace.yaml` fields `mode` and
     `precheck`, and `where` on a verification, next to the existing
     `workspace.yaml` and `--continue` text.
3. **`examples/`**: the example `workspace.yaml`, if one exists, mentions
   `mode` and `precheck` as commented, optional fields. Do not add new
   processes or settings.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
