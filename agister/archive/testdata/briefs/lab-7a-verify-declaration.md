# LAB-7, slice A: declaring `verify`

Implement the declaration side of ADR-002
(`agister/docs/adr/002-verify-and-bounded-repair.md`): settings, validation,
refusal, and how `check` and `process show` describe it. The verification
loop itself (running the command, repair turns, evidence of runs) is slice
B: **do not implement it here.** A call of a process with `verify` that
passes every check below must still run exactly as today; the declaration
is resolved and recorded, nothing more.

Read ADR-001 and ADR-002 first. Work in the Go module `agister/`.

## Settings

A process may declare one `verify` block beside `output`:

```yaml
verify:
  command: go test ./...      # one Bash command, required, non-empty
  timeout: 10m                # required, per run, a Go duration > 0
  max_attempts: 3             # required, integer >= 1
  instruction: >-             # required, non-empty
    The verification command failed. Fix the cause, not the check.
```

Unknown fields inside `verify` are refused like any other unknown field.

The attempt ceiling is a service setting, `max_verify_attempts` in
`service.toml` (integer >= 1, default 1). This is the only ceiling: no
policy field and no caller flag for it.

## Validation (`agister check` and resolution; invalid, never clamped)

1. `verify` without `timeout`, `max_attempts`, `command` or `instruction`
   is invalid, with a message naming the field.
2. `max_attempts < 1` is invalid.
3. `max_attempts` above the service's `max_verify_attempts` is invalid.
4. `verify.timeout` above the call's effective timeout is invalid (ADR-002
   rule 5). Where the effective timeout is known only at call time (a
   `--timeout` from the caller narrows it), the call is refused before the
   first turn with the same message.
5. A process with `verify` and no `workspace.checkout` is invalid (rule 2).
6. `max_attempts > 1` with an agent whose `session` is not `resumable`, or
   a runtime adapter that does not support resume, refuses the call before
   the first turn (rule 4), recorded like every refusal (ADR-001 rule 7).
   `check` reports it too when it can know it statically.

## Recording and display

- The resolved `verify` (command, timeout, max_attempts, instruction) is
  part of the process definition recorded with the run and covered by its
  digest: editing the settings after resolution does not change it.
- `agister process show <name>` prints the `verify` block and, when it is
  in effect, the warning from ADR-002 rule 10: the command runs with the
  operator's authority and can run code the agent wrote, including access
  to Agister's state. `agister check` prints the same warning once per
  process with `verify`.

## Tests and revert checks

- Committed tests, table-driven where natural, in the packages that own
  each rule, using `t.TempDir()` for settings on disk. One test per
  validation rule above, one for the refusal of rule 6 (record says
  refused, no provider turn started), one for the digest covering `verify`,
  one each for the `show` and `check` warning.
- `TestRepositoryProcessesRunOnFakeRuntimes`
  (`agister/cmd/agister/repo_settings_test.go`) must still pass.
- A revert-check spec `agister/testdata/revert-checks/verify-declaration.spec`
  in the format of the other specs there: one mutation per rule, each
  undoing that rule's check, each caught by the named tests.

## Checks to run and report

From `agister/`: `gofmt -l .` (empty), `go vet ./...`,
`go test -count=1 ./...`, `go test -race -count=1 ./internal/app/...`.
From the repository root: `scripts/revert-check.py
agister/testdata/revert-checks/verify-declaration.spec`.

Report each check with its exit code and final line, and list every file
you changed, repository-relative. Do not commit.

## Out of scope

Running the command, repair turns, content identity, evidence of runs,
status mapping, process-group handling, README and example settings (all
slice B). Anything ADR-002 lists under non-decisions or non-goals.
