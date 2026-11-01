# A call may work in the caller's worktree (LAB-88, part 1 of 3)

Implement ADR-022 (`docs/adr/022-a-call-may-work-in-the-callers-worktree.md`)
rules 1 to 5, 7 and 9 for a **fresh** call. Read the ADR first; it is
the specification. Parts 2 (verification in the worktree, rule 6) and 3
(continuation, rule 8) follow in later runs. Here:

- an in-place call whose process verifies keeps verifying on a clean
  copy, as now;
- `--continue` with in-place mode is refused, with a reason that says
  continuation in-place is not supported yet. Part 3 replaces that
  refusal.

## Wanted

1. **Settings and flag (rule 1).**
   - `workspace.yaml` (`definition.ParseWorkspace`) takes:
     - `mode: in-place|temporary`;
     - `precheck: {command, timeout}`, both required, parsed like `setup`.
   - Any other `mode` value is a problem `check` reports.
   - `agister run <process> --workspace in-place|temporary`: add it to the CLI, the help text, the client contract and `run.Request` (recorded).
   - The resolver reads the workspace settings for every process with a checkout (`resolve.go` `resolveSetup` reads them today only when the process has no setup). `check.go` tracks the dependency under the same condition. The process's own setup still replaces the workspace's setup whole, but `mode` and `precheck` still apply.
   - The flag overrides the setting.
   - An explicit flag on a process without `workspace.checkout` is refused.
   - A workflow call is refused before any node starts when:
     - it is given `--workspace`, if the CLI accepts the flag for workflows at all (otherwise it is a usage error);
     - or a node resolves to in-place through the repository's setting.
2. **Record (rule 2).**
   - A new in-place workspace record on `run.Record`: directory, worktree identity, repository, revision, mode. It is not an effect.
   - Never fill `Effects.Checkout`, `Copy` or `Unreleased` for it. Reap and release must not see it.
   - Old records still decode.
3. **Lock (rule 3).**
   - A per-worktree lock, keyed by the canonical (symlinks resolved) worktree path, in its own namespace under the state dir, separate from ADR-008's lock. It is held from before the checks of rule 4 until the changes are captured.
   - Held → refuse.
   - Under the lock, also refuse while a run that records the same in-place worktree may still have a writer:
     - the run is unfinished; or
     - a runtime or verify process it recorded is not known to have ended.

     For such a process, ask the reaper's `Processes` seam to end it; `ReapLeft` or an error refuses.
   - Record on the run whether its processes are known to have ended, so that a run which ended normally is not asked about again. The reap's failure path (`reap.go`: a failed step still finishes the run) must leave that flag unset.
4. **Admission (rule 4)**, refused before any turn, each with its own reason:
   - HEAD ≠ revision;
   - content identity ≠ the revision's (use the existing scratch-index identity in `adapters/git`, so `assume-unchanged` dirt counts);
   - staged changes;
   - a dirty submodule;
   - an untracked unignored file.

   Ignored files are allowed.
5. **Precheck and setup (rule 5).**
   - Run the precheck with the operator's authority, its timeout and process-group cleanup. Reuse the setup runner's machinery where it fits.
   - Record its command, digest, exit or timeout, and bounded output.
   - Refuse on non-zero, on timeout, or on a change to the content or HEAD. Re-check rule 4 after it.
   - Do not run `setup`; record a `SETUP_SKIPPED` event.
6. **End (rule 7).**
   - HEAD ≠ revision at the end (an agent commit) fails the call.
   - Capture `changes.patch` from the revision and record the content identity it was taken from.
   - On every end status, never reset, clean or remove anything in the worktree, and never undo an agent's commit.
7. **Agent request.**
   - The turn's `Cwd` is the worktree.
   - No continuation notice (fresh calls only).

## Tests (committed, fakes at seams per ADR-017; no mutation checks)

- Settings:
  - the `mode` default is temporary;
  - `mode: in-place` applies;
  - the flag overrides in both directions;
  - a bad `mode` is reported by `check`;
  - a process with its own `setup` still gets the `mode` and `precheck` of `workspace.yaml`;
  - an explicit flag on a checkout-less process is refused;
  - a workflow with in-place is refused before any node.
- Each refusal of rule 4 is refused before the runtime spy sees a turn. Use real git in `t.TempDir()` where the existing git tests do. The refusals: HEAD ≠ revision, modified tracked file, `assume-unchanged` modification, staged change, untracked file, dirty submodule. An ignored file is accepted.
- Precheck:
  - non-zero exit is refused;
  - timeout is refused;
  - a precheck that modifies a tracked file is refused;
  - a passing precheck is recorded.
- Lock:
  - a second concurrent call on the same worktree is refused;
  - an unfinished run that records the worktree refuses the call;
  - a finished run whose reap left its process (`ReapLeft`) refuses the call;
  - a finished run whose process the seam reports gone or killed admits the call.
- Happy path:
  - `Workspaces.Checkout` is never called;
  - setup is not run, and `SETUP_SKIPPED` is recorded;
  - the turn's cwd is the worktree;
  - `changes.patch` is stored, and its recorded identity matches the tree;
  - the tree still holds the changes;
  - no release or reap effect is recorded, and a reap leaves the worktree alone.
- Failure or timeout of the turn leaves the changes in the tree.
- An agent commit fails the call.

## Out of scope

Verification in the worktree, continuation in-place, the caller skill,
the README.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
