# LAB-43, step 2: ADR review fixes, and the `stale.recover` settings

ADR-023 (`agister/docs/adr/023-a-stale-call-is-resumed-once.md`) decides
that a stale call is resumed once, with the evidence. Read it first, with
ADR-001 and ADR-002. This step does the ADR's review fixes and builds its
settings (rules 5 and 6). The recovery turn itself, its records and the
`no_output` change are the next step: do not build them here.

## 1. ADR review fixes

The adr_review workflow run 20261006T162846Z-4c0d47 ruled these items to
fix. Do each as its action says.

1. **Amendment text self-references ADR-023.** In
   `agister/docs/adr/023-a-stale-call-is-resumed-once.md`, around line 303,
   replace the parenthetical "(ADR-023)" in the amended ADR-002 rule with
   "this ADR" or remove it, so the ADR references only earlier decisions.
2. **Context records research findings instead of the timeless problem.**
   Rewrite Context lines 45-50 of
   `agister/docs/adr/023-a-stale-call-is-resumed-once.md` as enduring
   problem statements (repeated loops indicate no progress; a bare nudge
   adds no facts), and keep the empirical research in the brief or a
   separate research record.

Change nothing else in the ADR.

## 2. Settings: `stale.recover` (ADR-023 rules 5 and 6)

- **Parse** `stale.recover.max_resumes` (an integer, at least 0) and
  `stale.recover.instruction` (text) in a policy and in a process, beside
  the other staleness limits (`internal/domain/definition/limits.go`). An
  unknown key under `recover` is a problem, as elsewhere.
- **Compose** (`internal/domain/policy/policy.go`): the policy sets the
  ceiling and a process may only lower it, down to 0. A process value
  above its policy's, or above 0 where the policy sets none, is invalid,
  never clamped. Unset is 0. The process's instruction, where it gives
  one, replaces the policy's. An effective `max_resumes` above 0 without
  an instruction is invalid, and `agister check` says so.
- **Refuse** (`internal/app/resolve.go`, and the matching problem in
  `internal/app/check.go`): a call whose effective `max_resumes` is above
  0 is refused before its first turn when its agent's sessions may not be
  continued or its runtime's adapter cannot resume, exactly where and as
  a `verify.max_attempts` above 1 is today.
- **Carry** the effective budget and instruction to the call
  (`CallStale` in `internal/app/stale.go`, `callStale` in
  `internal/app/calls.go`) and into the run's recorded limits, so the
  next step can read them. Nothing acts on them yet: with any
  `max_resumes`, a stale call still ends as today.
- **Show**: `agister process show` prints the effective budget with the
  other staleness limits when it is above 0 (`internal/cli/cli.go`,
  `internal/contract/contract.go`, `internal/app/definitions.go`).
- Do not add `stale.recover` to the repository's `.agister/` policies or
  to the shipped ones, except one shipped example that shows the fields
  if the examples already show the other staleness limits.

## Tests

Committed, deterministic, at the existing seams (root `AGENTS.md`,
"Verifying fixes"; no mutation or revert checks):

- parsing: both fields, a negative `max_resumes`, an unknown key;
- composition: the policy's ceiling, a process lowering it, a process
  lowering it to 0, a process widening it is rejected, a process setting
  it where the policy sets none is rejected, the process's instruction
  replacing the policy's, `max_resumes` above 0 without an instruction is
  rejected;
- refusal: a fresh-only agent and an adapter without resume are each
  refused before the first turn, and `check` reports each; with
  `max_resumes` 0 or unset neither is refused;
- `process show` prints the budget, and prints nothing for it when 0.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

Use the quiet test commands from `agister/AGENTS.md`. List every file you
changed. In your notes, name anything the next step (the recovery turn)
needs to know about what you built.
