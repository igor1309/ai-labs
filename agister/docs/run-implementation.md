---
date: 2026-10-16
model: claude-opus-5-5
description: "Run implementation notes: how a resolved request becomes a run, built slice by slice; the first slice runs a workflow of bash steps end to end, the second a step on claude-code or codex"
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
group started when its context ends, by SIGTERM, then SIGKILL when the
two seconds' grace has passed on the timer it is given (ADR-009, rule
5), and when the program exits, whatever it left running. Output held
open by a process that left the group is read no longer than the
grace: the streams are kept so far, marked incomplete. Where it cannot
observe a program's exit before reaping it, it starts nothing, and says
the program could not start. A
program that cannot start is an error that says so. It starts programs
through a starter it declares, in its own types, which the composition
answers from gokit's process groups. Its tests run real programs
(ADR-009, rule 3).

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
| an input whose source is not plugged in | failed | `refused` |

A turn whose context core ended, by the time limit or the caller, ends
interrupted with core's class, however its program then exited.

A completed bash call's output is `exit_code`, and `stdout` and
`stderr`, each its `head`, `tail`, `size` and `digest`, as the
supervisor keeps it: the fields a binding or an output reads. Timing is
measured by core, through a clock, and the time limit kept by its
timer; cost is unknown, bash reporting none (ADR-012, rule 5), printed
as `null`, never 0. The call's warnings are its step's plan's (ADR-003,
rule 5), given whatever its status.

**`core/inputs`** resolves a workflow's inputs at its boundary, and a
call's before it starts (ADR-010, rule 3), from their sources over the
params given, a param not given taking its default, to a value and its
identity, the SHA-256 of its text; and a process's environment, each
value a text or a reference to its params and inputs. A source is a
port, by name, that the composition plugs in (ADR-010, rule 2); this
slice plugs in `param`: the param named by its `name`. An input whose
source is not plugged in refuses the call before it starts: failed,
`refused`, no source plugged in by that name. The composition refuses
such a run before any step runs; core keeps its own refusal per call,
since a caller of core other than this composition is not checked up
front.

**`core/workflow`** runs a workflow whose items are steps: in order,
each step's bindings giving its process's params from the workflow's
params and inputs and the outputs of the steps before it (ADR-011, rule
3); a value that is not text is given as its JSON. A step that does not
complete ends the run with its status and class; no later step starts.
The run's output is its output mapping, read from its params, its
inputs and its steps; its status and class are its last call's; its
timing covers the whole run; its cost is unknown where a call's is; its
warnings are every call's.

**The composition** answers `cli`'s run from resolve and core. A request
resolves first; a refusal is printed to stderr, and nothing runs. It
builds core's workflow from the resolved settings and from the documents
of the same snapshot resolve checked: each step's script is its
process's prompt, the text of the prompt document; its time limit is its
process's; its warnings its plan's. It runs in the root of the git
worktree that holds the launch directory (ADR-004, rule 1); outside one,
the request is refused. What this slice does not run is refused before
anything runs, naming it: a step on a runtime with no turn yet; an item
that is not a step; an input from a source other than `param`, or with a
brief form; a workspace's revision, clean, or read-write access; a
staleness limit; a process's instruction or guidance on bash. Each is
named, in the order the request's documents give them. A recovery on
bash is resolve's refusal (ADR-012, rule 3). The program's environment
is Agister's own, then the process's, then the inputs. SIGINT or SIGTERM
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
  that drops a declared check would mislead. Read-write access is
  refused for that: it asks a hold this slice has not.
- The composition reads what core needs and resolve does not give, a
  time limit, a param's default, a source's name, from the documents
  of the snapshot resolve checked: resolve holds only what it reads,
  and the documents have already composed the layers (ADR-002), so a
  value read there is the one resolve checked.

## A step on a model runtime

A step whose agent names claude-code or codex runs: one turn, through
the supervisor, its output checked against its process's schema. The
wrappers are the archive's, ported to the supervisor and to their own
types; what the archive did besides one turn waits
(`backlog/run-path.md`).

**The supervisor** writes the text it is given to the program's stdin,
then closes it, and gives each line of stdout, as it reads it, to a
function it is given, besides keeping the ends of the stream as before.
Stdin is written as stdout is read; stdin the program does not read is
dropped, no error. Best effort: a line too long to hold is skipped.

**The claude-code wrapper** runs a turn: the message on stdin, and
`claude -p --output-format stream-json --verbose --permission-mode
dontAsk --tools=<tools> --allowedTools=<tools> --strict-mcp-config`,
then `--model`, `--effort`, `--append-system-prompt <instruction>` and
`--json-schema <schema>` where given; the tools the options and `Skill`,
joined by commas, `Skill` once and on every turn, as the archive gave
it: the repository's skills load as they would for a person (ADR-003,
rule 6), and the mapping's contract, `claude-code/3`, is written for
these flags. It reads
stdout's lines as stream-json: the session from the init event, the last
assistant text, and the result event: its text, its
`structured_output`, its `total_cost_usd`, its `usage` (input, output,
cache read and cache write tokens, each unknown where not reported,
never 0). A result that is not a success is the runtime's failure,
classed by its fields as the archive did: a status 429 or a rejected
rate-limit event seen, `rate_limited`; 401 or 403, `auth`; 413, a prompt
too long or the context window, `context_overflow`; else
`runtime_error`; its reason the result's errors or text. A schema given
and a success with no structured output is `invalid_output`. With no
result event, a program that exited non-zero is `runtime_error`, its
reason stderr's tail; one that exited 0 is `no_result`.
Its tests give a spy in place of the supervisor, fed recorded lines.

**The codex wrapper** runs a turn: `<instructions>`, the instruction,
`</instructions>`, a blank line and the message on stdin, the block left
out with no instruction; and `codex exec --json --skip-git-repo-check
--sandbox <option> --config approval_policy="never"
--ignore-user-config --ignore-rules`, then `--model`, `--config
model_reasoning_effort="<effort>"` and `--output-schema <file>` where
given, and last `-`, the prompt read from stdin. The schema is written
to a file in a folder of its own under the folder the composition gives,
removed once the turn has returned. It is given exactly one option; any
other number is its error before anything starts. It reads stdout's
lines as JSON events: the session from `thread.started`, the last
`agent_message` item's text, the usage of `turn.completed` (input,
cached input as cache read, output and reasoning tokens) and the message
of `turn.failed`, classed by its words as the archive did: a rate or
usage limit or 429, `rate_limited`; unauthorized, 401 or login, `auth`;
the context window or length, `context_overflow`; else `runtime_error`;
its reason the message. Only `turn.completed` and `turn.failed` decide;
an `error` event does not. With a schema, the last message of a
completed turn is the structured output: none is `invalid_output`, as
is one that is not JSON. Its cost is unknown. With neither deciding
event, it ends as claude-code's does with no result.

**Each wrapper's facts** say how its runtime takes a call's inputs
(ADR-003, rule 7; ADR-010, rule 1): bash in its program's environment;
claude-code, codex and pi in its message.

**`core/call`.** The runtime protocol grows: a turn is also given the
instruction, the model, the effort, the options and the schema, each
none where not given; and a model's turn gives, besides how its program
ended, its reply: its text, its structured output, its session, its cost
and usage as reported, and its failure class and reason where it reports
one. A caller is made for a runtime with how it takes its inputs. A step
gives its inputs in the order its process declares them, and the
documents it is given, each a name and a text, in order. Core builds a
model's message: a section for each input, then each document, in order:
`## <name>`, a blank line, and the text; sections apart by a blank line.
A text with a newline in it is fenced: a fence of more backticks than
the longest run in it, at least three, on its own line; the text; a
newline, unless it ends in one; and the fence again. Its inputs reach no
environment; the process's environment reaches every program (ADR-012,
rule 2).

A model's call ends as a bash call does where its context was ended, its
program could not start or was ended by a signal, or the runtime gave
an error; otherwise by its reply:

| The reply | Status | Class |
|---|---|---|
| the failure class `no_result` | lost | `no_result` |
| another failure class of core's | failed | that class |
| a failure class core has not | failed | `runtime_error` |
| no failure class, a schema given, its structured output not valid against it | failed | `invalid_output` |
| otherwise | completed | |

The runtime's failure decides before the schema: a turn that failed is
not checked.

Core's classes, a closed set (ADR-001, invariant 3), are the first run's
and `invalid_output`, `rate_limited`, `auth`, `context_overflow` and
`no_result`. A completed call's output is its structured output, where a
schema was given; else `text`, its reply's text. A schema is checked
through a validator core declares, which gives why it rejects; the
composition answers it. The result gains the call's `usage`, `session`
and `reason`: usage as the runtime reported it, input, output, cache
read, cache write and reasoning tokens, each unknown, printed as `null`,
where not reported, and none on bash; the session the runtime reported;
and the reason of a call that did not complete, the runtime's or the
validator's words, cut to 1 KiB. Cost is the runtime's own report,
unknown where it gives none (ADR-012, rule 5).

**`core/workflow`** gives the run's `usage`, `sessions` and `reason`:
each count of usage the sum of what the calls reported, `null` where
none reported it; its sessions, each step's name to the session its call
reported, those that reported one; the reason its last call's, as its
status and class are. A step that ends lost ends the run lost, as one
that fails ends it failed. **`cli`** prints them, after cost: `usage`,
its five counts, `sessions`, and `reason`, `null` where there is none; a
run requested as a step alone has the step named by its process.

**The composition** gives each step its own caller, for the runtime its
agent names: bash, claude-code or codex, each through the supervisor,
with how its wrapper's facts say it takes its inputs. It gives a model
step its inputs, in the order its process declares them; its documents,
the prompt document as `prompt` where its process names one, then each
guidance document by its name; its instruction, its process's; the
model and the effort, its agent's; the options, its plan's; the schema,
the bytes of its process's output schema in the snapshot. Codex's
schema folder is the system's temporary folder. The validator is
`github.com/santhosh-tekuri/jsonschema/v6`, which the archive used; a
schema that does not compile fails the call that names it,
`invalid_output`, its reason the validator's. What this
slice does not run is refused before anything runs, naming it, as
before: a step on pi; a step's session; a process's recovery; a
process's cost limit; an input named as a document of its step, `prompt`
or a guidance name. Skills need no refusal: settings name none yet, and
resolve refuses one named (`backlog/skills.md`). The rest of the first
run's refusals stand: sources but `param`, brief forms, the workspace,
staleness and an item that is not a step. Every process `home` ships
asks one of these, so none of them runs yet: a repository's own process
does.

Decisions, each with its reason:

- Pi waits: its wrapper keeps sessions in files of its own, and two
  runtimes prove the protocol. It is next, in `backlog/run-path.md`.
- Session, recovery and skills wait: each needs what a resumed turn or
  a skill's files are given, which the record and the skills backlog
  settle. The wrappers report the session now, so the record can keep
  it.
- Codex's cost waits: the archive priced a thread through `ccusage`, a
  second program; an unknown cost is honest meanwhile (ADR-012, rule 5).
- A cost limit is refused, not kept: core ends no call at its cost yet,
  and codex reports none to end it by.
- No version warning yet (ADR-003, rule 8), nor the model the runtime
  reports: both are to be read from the turn, never probed, and come
  with the record, which keeps what the turn reported.
- The model is told nothing Agister writes: the instruction as settings
  give it, and each input and document under its name. What Agister
  tells an agent is settings' (ADR-001, invariant 2); a section's name
  and fence arrange, they do not tell.
- The classes by words follow the archive, which observed the budget
  subtype and a 429 live and the rest not; a wrong guess is
  `runtime_error`, still failed.
- A turn with no result is lost, not failed: it ended without finishing
  (ADR-001, invariant 3), as the archive held.
- Best effort, not guarantees: usage is summed from what was reported,
  a reason is the runtime's words cut to 1 KiB, a line too long is
  skipped, a bad schema fails its call. Each is enough to run and to
  see why a call failed; more waits for a need.
- The run carries each step's session, by its name, until the record
  keeps it (ADR-011, rule 5).
