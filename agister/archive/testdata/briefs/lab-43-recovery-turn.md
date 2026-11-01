# LAB-43, step 3: the recovery turn, its records, and `no_output` as a failed attempt

ADR-023 (`agister/docs/adr/023-a-stale-call-is-resumed-once.md`) decides
that a stale call is resumed once, with the evidence. Read it first, with
ADR-001 and ADR-002: it is the specification, rule by rule. Step 2 built
its settings (rules 5 and 6): the effective budget and instruction reach
the call as `res.Effective.Stale.Recover`, a
`CallRecover{MaxResumes, Instruction}`, and nothing acts on them yet. This
step builds the behaviour: rules 1 to 4 and 7 to 10.

## What to build

1. **The recovery turn** (rules 1, 3, 6, 7). Where a turn of the call is
   ended at a staleness limit (`take` in `internal/app/calls.go`; the
   first turn, a repair turn in `internal/app/verify.go`, or a recovery
   turn), a recovery turn follows when every condition of rule 1 holds.
   It resumes the call's session as a repair turn does: the session ID the
   runtime reported, what is left of the call's timeout, what is left of
   the cost limit (no turn when an earlier turn's cost is unknown under a
   cost limit). A recovery that does not start spends no resume and
   leaves an event that says why.
   - The same evidence is never sent twice (rule 3): the same limit on
     the same thing (the same tool and input by SHA-256 for
     `repeated_tool_calls` and `tool_command`; the limit itself for
     `no_event`) ends the call with that limit's status and class, even
     with resumes left. Another limit is recovered if a resume is left,
     else the call ends with the class of the limit just reached.
   - A valid recovery turn is the call's latest turn: verification or
     completion follows as after any valid turn. Where it stood in for a
     repair turn, the verification loop goes on with its next run; it
     spends no verification attempt.
   - A recovery turn that reports a different session fails as a repair
     turn that does.
   - With `max_resumes` 0 or unset, a call behaves exactly as today:
     existing tests keep passing unchanged, except
     `TestACallCarriesAndRecordsItsStaleRecovery`
     (`internal/app/stale_recover_test.go`), whose assertion this step
     changes.
2. **The message** (rules 2 and 4): the instruction, then the evidence,
   which names the limit. Put its assembly beside the repair prompt
   (`prompt.Repair`). The core adds no advice of its own.
   - `repeated_tool_calls`: the call (tool and bounded input), how many
     times in a row, and the last result the runtime reported for it, if
     any. Adapters report today only that a tool call finished
     (`ToolFinished(id)`). Extend that report with the call's bounded
     result for each adapter whose event stream carries it, through the
     adapter's own contract (the core knows no runtime's event format,
     ADR-001); an adapter whose stream does not carry it reports none, and
     the message then says nothing of a result. Say in your notes which
     adapters report it.
   - `tool_command`: the command and how long it ran.
   - `no_event`: that the turn was interrupted after the limit without an
     event; no claim about what the agent did.
3. **`no_output` is a failed attempt** (rule 8). A verification run ended
   at `stale.no_output` no longer stops verification outright
   (`internal/app/verify.go`, the `ran.Stale != nil` case). It is a failed
   run of its attempt, and a repair turn may follow under ADR-002's own
   conditions, with "no output for the limit, then ended by Agister" as
   how the run ended and the bounded output. When no repair may follow,
   the call ends as today: interrupted, timeout. It spends verification
   attempts, not resumes, and does not depend on `stale.recover`. The
   same content is never rerun.
4. **The recovery record** (rule 9). Each recovery turn is a record of its
   own in the run's record, in `internal/domain/run`: its number, the
   stale turn it follows with that turn's stale record, the SHA-256 of
   the message, the session resumed and the session reported, the turn's
   usage, cost and timing, and its outcome: completed, the same limit
   again, a different limit, or another failure. A call does not complete
   before its recoveries are recorded. `agister runs show` prints them
   with the rest of the record.
5. **No new status or failure class** (rule 10).

Keep the architecture rules: each component declares the interfaces it
requires; the recovery logic is a component with its own seams, not more
branches inside `take`. If a rule of the ADR cannot be built as written,
say so in your notes and build the nearest thing; do not edit the ADR.

## Tests

Committed, deterministic, with the injected clock and timer and the fake
runtimes the staleness tests already use (`internal/app/stale_test.go`,
`cmd/agister/verify_loop_test.go`); no wall-time waits, no mutation or
revert checks (root `AGENTS.md`, "Verifying fixes").

For each of `repeated_tool_calls`, `tool_command` and `no_event`:

- the resume is used: the stale turn is followed by one recovery turn
  that resumes the session with the instruction and that limit's
  evidence, the call completes, and the recovery record says completed;
- the same staleness again ends the call, with the limit's class
  (`budget_exhausted` for a repeated call, `timeout` for the other two),
  and the record says the same limit again;
- `max_resumes: 0` ends the call as today, with no recovery turn and no
  recovery record.

For `no_output`: a stale run is followed by a repair turn that receives
the output tail and "no output for X", and the next run passes; with
`verify.max_attempts: 1` the call ends as today; unchanged content after
the repair is not rerun.

Also: a different limit after a recovery, with a resume left and with
none; a stale turn that reported no session is not recovered; a recovery
turn that reports another session fails as a contract violation; no
recovery turn when the cost of the stale turn is unknown under a cost
limit; a stale repair turn is recovered and verification goes on without
spending an attempt; the recovery message's digest in the record is the
digest of the message sent.

Step 2 already tests that a process widening the ceiling is rejected and
that an agent or adapter without resume is refused; keep those passing.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

Use the quiet test commands from `agister/AGENTS.md`. Leave
`README.md`, the caller skill, the settings diagrams and Pages to the next
step. List every file you changed, and in your notes say what a caller
now sees differently, for that step's documents.
