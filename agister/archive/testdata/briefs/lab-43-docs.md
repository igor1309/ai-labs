# LAB-43, step 4: the documents say what the binary does

ADR-023 (`agister/docs/adr/023-a-stale-call-is-resumed-once.md`) is now
built: the `stale.recover` settings (step 2) and the recovery turn, its
records and `no_output` as a failed attempt (step 3). `agister/AGENTS.md`
makes these documents done gates; bring each in line with the binary.
Read the code and its tests for what is true; this brief only lists what
changed.

## What a caller now sees

- `stale.recover.max_resumes` (policy sets the ceiling, a process may only
  lower it, unset is 0) and `stale.recover.instruction` (required when the
  budget is above 0). A budget above 0 refuses the call before its first
  turn for a fresh-only agent or a runtime that cannot resume.
  `process show` prints `recovery resumes N` on the stale line.
- With a budget, a turn Agister ended at `no_event`, `tool_command` or
  `repeated_tool_calls` may be followed by one recovery turn in the same
  session, with the instruction and the evidence. The same limit on the
  same thing again ends the call with that limit's class. With no budget,
  every limit ends the call as before.
- A verification run ended at `stale.no_output` is a failed attempt: a
  repair turn follows while `verify.max_attempts` remain, whatever
  `stale.recover` says. With one attempt, the call ends as before.
- The run record has `recoveries`, shown by `agister runs show`: `number`,
  `follows`, `stale`, `message_sha256`, `resumed`, `session`, usage, cost,
  timing, `outcome` (`completed`, `same_limit`, `different_limit`,
  `failed`) and `error`. New events: `RECOVERY_STARTED`,
  `RECOVERY_NOT_STARTED`, `RECOVERY_FINISHED`. A repeated call's `STALE`
  event may carry `result`.

## The documents

1. `agister/README.md`: the staleness paragraph no longer says ADR-023 is
   proposed and not built; it says what is above, briefly. ADR-023 is in
   whatever list of ADRs the README keeps.
2. `agister/docs/adr/023-a-stale-call-is-resumed-once.md`: status
   `Accepted`. Change nothing else in it.
3. The caller skill, `agister/skills/agister/SKILL.md`: what a caller
   must know. The Verification section says a run that goes silent is a
   failed attempt like a failing one; "Read the result" names
   `recoveries`; say in one or two sentences what `stale.recover` does
   and that it needs an agent and runtime that resume. Keep its voice and
   length; add nothing a caller does not need.
4. The settings diagrams, `agister/docs/settings-architecture/`
   (`index.html`, `detailed.html`, `notes.md`): the `stale` block gains
   `recover`, with what it holds and that it only narrows.
5. The Pages settings view, `agister/pages/`: where it shows a process's
   or policy's staleness limits, it shows `stale.recover` too, with a
   test beside the existing ones. If Pages shows no staleness limit at
   all, change nothing there and say so in your notes.

Change no code outside `agister/pages/`.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`, and the Pages tests the `pages/README.md` names, if any run outside Go.

List every file you changed.
