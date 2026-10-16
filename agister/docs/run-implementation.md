---
date: 2026-10-16
model: claude-opus-5-5
description: "Run implementation notes: how a resolved request becomes a run, built slice by slice; the first slice runs a workflow of bash steps end to end"
---

# Run implementation notes

How a request that resolves becomes a run (ADR-001, "Core" and "Starting
a run"), built in slices. Each slice runs something whole; what it
leaves out is in `backlog/run-path.md`.

## The first run

A workflow whose steps are bash steps, in sequence, runs end to end:
`agister run` resolves the request, core calls each step on the bash
runtime, through the supervisor, and the result is printed.

**The supervisor** (ADR-012, rule 6) is a wrapper. It starts a program
in a directory with an environment, and the program's group with it;
keeps of stdout and of stderr the first and the last 16 KiB, the size
and the SHA-256 digest of the whole; and gives how the program ended: its
exit code, or the signal that ended it. It ends the program and all its
group started when its context ends, by SIGTERM, then SIGKILL after two
seconds, and when the program exits, whatever it left running. A
program that cannot start is an error that says so. Its tests run real
programs (ADR-009, rule 3).

**The bash wrapper** runs a turn: a script, a directory and an
environment, as `bash -c <script>`, through the supervisor, and gives
what the supervisor gives, its error that the program could not start
included. Its tests give a spy in place of the supervisor (ADR-009,
rule 3).

**`core/call`** declares the runtime protocol: a turn is given the
prompt, the directory and the environment, and gives the output and how
the program ended; or that its program could not start; or another
error. A call makes one turn on bash (ADR-012, rule 7), over the
environment the composition gives, then its process's environment, then
each input by its name; and ends in the result shape (ADR-001,
invariant 3):

| How the turn ended | Status | Class |
|---|---|---|
| the script exited, any code | completed | |
| the program could not start | failed | `runtime_unavailable` |
| another error of the runtime | failed | `runtime_error` |
| the process's time limit | interrupted | `timeout` |
| the caller cancelled | interrupted | `cancelled` |
| a signal Agister did not send | failed | `killed` |

A completed bash call's output is `exit_code`, and `stdout` and
`stderr`, each its `head`, `tail`, `size` and `digest`, as the
supervisor keeps it: the fields a binding or an output reads. Timing is
measured by core, through a clock; cost is unknown, bash reporting none
(ADR-012, rule 5). The call's warnings are its step's plan's (ADR-003,
rule 5), given whatever its status.

**`core/inputs`** resolves a workflow's inputs at its boundary, and a
call's before it starts (ADR-010, rule 3), from their sources over the
params given, a param not given taking its default, to a value and its
identity, the SHA-256 of its text; and a process's environment, each
value a text or a reference to its params and inputs. The source this
slice knows is `param`: the param named by its `name`. A source it does
not know refuses the call before it starts: failed, `refused`, naming
the source.

**`core/workflow`** runs a workflow whose items are steps: in order,
each step's bindings giving its process's params from the workflow's
params and inputs and the outputs of the steps before it (ADR-011, rule
3); a value that is not text is given as its JSON. A step that does not
complete ends the run with its status and class; no later step starts.
The run's output is its output mapping, read from its params, its
inputs and its steps; its status and class are its last call's; its
timing covers the whole run; its cost is unknown where a call's is; its
warnings are every call's.

**The composition** answers `cli`'s run from resolve and core. A
request resolves first; a refusal is printed to stderr, and nothing
runs. It builds core's workflow from the resolved settings and
documents: each step's script is its process's prompt, the text of the
prompt document; its time limit is its process's; its warnings its
plan's. It runs in the root of the git worktree that holds the launch
directory (ADR-004, rule 1); outside one, the request is refused. What
this slice does not run is refused before anything runs, naming it: a
step on a runtime with no turn yet; an item that is not a step; an
input from a source other than `param`, or with a brief form; a
workspace's revision or clean; a staleness limit or a recovery; a
process's instruction or guidance on bash. The program's environment is
Agister's own, then the process's, then the inputs. SIGINT or SIGTERM
to Agister cancels the run: the call's program and its group are ended,
and the result says `cancelled`.

**The command line.** `agister run <workflow>` runs a workflow;
`agister run --process <name> --agent <name>` runs a step alone
(ADR-013). `--param <name>=<value>` gives a param, repeated for many;
`--dir` sets the launch directory. It prints the result as JSON on
stdout: status, class, output, timing, cost and warnings. It exits 0
when the run completed, 1 when it did not or was refused, and 2 on a bad
command, with its usage on stderr.

Decisions, each with its reason:

- No record, no hold, no events in this slice: each is a part of its
  own (runstore, admit, watch), and a run of bash steps is whole without
  them. They are next, in `backlog/run-path.md`.
- The bounds, 16 KiB each end and two seconds' grace, are the
  supervisor's, not settings': nothing yet asks to change them.
- What the slice cannot honour is refused, never run unchecked: a run
  that drops a declared check would mislead.
