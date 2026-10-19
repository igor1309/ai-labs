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
rate-limit event seen, `rate_limited`; 401 or 403, or
"not logged in" in its text, `auth`; 413, a prompt
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
removed once the turn has returned, best effort: a folder that cannot
be removed is left, the turn's end unchanged. It is given exactly one
option; any
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

**Home's folder** is `$AGISTER_HOME` where it is set, else
`~/.agister` (ADR-002, rule 2): a seam, so a test, or a person trying
the new Agister beside the archive's settings, points it elsewhere
while claude-code and codex keep their own logins under the real home.

**The end-to-end check**, `scripts/e2e.sh`, runs the built `agister` on
a scratch git repository, its home a copy of `home` and a process
`ask`, whose output has a schema: one step on claude-code with the model
`haiku`, one on codex at the effort `low`, the least its models take.
Each completes, its output valid, its usage and session reported. It
runs real programs on the owner's logins and costs a few cents, so it
is opt-in: its tests run only with `AGISTER_E2E=1`, and
`scripts/test.sh` says it skipped them. It is run before every PR that
touches the run path (`docs/process.md`).

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
- A step's output is a JSON object: bindings read its fields
  (ADR-011, rule 3). A schema that lets a reply be another value, an
  array or a string, gets `invalid_output` for it.
- The run carries each step's session, by its name, until the record
  keeps it (ADR-011, rule 5).

## Inputs and progress

A step reads a file, a revision and the files a change touched, a brief
checked against its forms, and a run tells, as it goes, what each step
is doing. The processes `home` ships declare these, and the archive
gave them; what they also declare, a workspace and staleness, waits
(`backlog/run-path.md`).

**`git`** gives, besides a worktree's root, in a directory: a
revision's commit, the full id of what `git rev-parse --verify
<rev>^{commit}` names, or an error naming the revision, with git's
words, where it names none;
and the files changed between two revisions, from their merge base to
the second, as `git diff --name-only -z` lists them. Its tests run git
in a temporary folder (ADR-009, rule 3).

**`core/inputs`** checks a text input against the brief forms it names
(ADR-010, rule 5), as the archive did: a part is found by its heading
line, outside fenced code, up to the next heading of its level or
above. A text takes a form where no part appears twice, each required
part is there and not empty, a part that `reads` a text reads exactly
it, and a part that refers to a `file` names one in back quotes, the
first such, that exists. A text that takes none of its forms is
refused: failed, `refused`, naming, for each form, what is wrong; a
workflow's input refused so ends the run with that reason. Core
knows no file: whether a path exists is a port, the composition
answers it. A source may give its value's identity; where it gives
none, the identity is the SHA-256 of the text, as before.

**The composition** plugs in the sources:

| Source | Its arguments | Its value |
|---|---|---|
| `param` | `name` | the param, as before |
| `file` | `path` | the file's text |
| `git.revision` | `rev` | the commit's full id, its identity too (ADR-001, invariant 4) |
| `git.changed_files` | `base`, `head` | the paths, one a line, sorted as git lists them; none is a refusal |

A path, a file's and a brief's reference alike, is relative to the
launch directory, as the person typed it, or stands as given where it
is absolute; the git sources run in the
worktree's root. Each brief form a text input names is the brief
document of that name in the snapshot resolve checked. A source other
than these is refused before anything runs, as before; a brief form no
longer is.

**Progress**, best effort. A model's wrapper reports each tool call it
recognizes in its stream, as it reads it, through a report the turn is
given: the tool's name and a short text of what it was given, as the
archive printed them. A line it does not recognize it skips; bash
reports nothing. `core/call` is given the report with each call and
passes it to the turn; `core/workflow`'s port to call a step takes it
too, and its step names its agent. `core/workflow` reports to its
events port, by the step's name: the step started, on its agent; each
tool call; and the step ended, with its status, class and how long it
took. The composition prints each to stderr as a short line, for
example:

```
· implement: started on claude-opus
· implement: Bash {"command":"go test ./..."}
· implement: ended completed in 3m2s
```

The lines are for a person, not a contract: their wording, length and
which tool calls a wrapper recognizes may change. Stdout keeps only the
result.

Decisions, each with its reason:

- Progress is a line on stderr, not a record: the record is runstore's,
  and waits (`backlog/run-path.md`); a person and the loop's logs need
  to see a step working now.
- Tool calls only, not text or thinking, and no format promised: the
  archive's lines were these, and a person reading along needs no more.
- `git.changed_files` from the merge base, as the archive gave it: a
  review reads what the candidate changed, not what its base gained.
- No changes is a refusal, as the archive held: a review of nothing is
  a mistake in the request.
- A path is relative to the launch directory: the person names a brief
  where they stand; the run's root is git's.
- Progress is not guarded beyond a person reading it: no test of when
  a line appears, none of a stderr its reader has closed. Agister's
  stderr is a terminal or a file in every use; a reader that closes it
  early is the caller's choice.
- A report is given with every call, never left out: core needs no
  fallback for a call with none (ADR-009, rule 2).

## A step in a held worktree

A step whose process pins a revision, asks a clean worktree, writes to
it, or sets staleness limits runs: home's `implement`, as
`agister run --process implement --agent claude-opus --param
brief=<path>`. What the archive also did, recording the worktree's
changes and resuming a stale turn, waits (`backlog/run-path.md`).

**`git`** gives a worktree's HEAD, and whether its content is HEAD's:
no change staged, unstaged or untracked, as `git status --porcelain`
lists them.

**`core/admit`** admits a call before it starts (ADR-004, rules 2 and
3): where its process pins a revision, the worktree's HEAD is the
commit its `git.revision` input names, and a pin from any other input
is refused as not run yet; where it asks a clean worktree, its content
is HEAD's; and it takes the worktree's hold, alone for a writer, a
process declaring read-write access, shared for a reader. A call not
admitted is refused, not queued: failed, `refused`, saying why. Admit
wraps the call: it makes the call through a port of its own, and
releases the hold when the call ends, however it ends. The worktree's
facts, the hold and the call are ports, the composition answers them.

**`core/watch`** observes a turn (ADR-006, rule 1), best effort, over
what its wrapper reports. The runtime protocol's report grows: besides
each tool call, a model's wrapper reports every other line it reads,
which the progress lines skip. Claude-code's and codex's tool calls are
reported whole, cut only where printed. The watch reports the turn
stale when the same tool call, its name and all it was given, comes
the process's `repeated_tool_calls` times in a row, the other lines
between them not counted; when nothing follows a tool call for its
`tool_command`; or when nothing comes at all, from the turn's start,
for its `no_event`. A limit not set is not watched. Its time is a clock
and a timer (ADR-009, rule 5).

**`core/call`** declares its staleness port (ADR-001): given a turn's
limits and its reports, it tells when the turn went stale and what went
stale; the composition answers it with `core/watch`. Core/call ends a
stale turn, its program's group with it (ADR-006, rule 2); the turn's
work stays in the worktree. A repeated tool call ends the call failed,
`budget_exhausted`, which joins core's closed set of classes; a quiet
turn or a hung tool command ends it interrupted, `timeout`. Its reason
says what went stale.

**The composition** chains `inputs`, `admit` and `call` for each step
(ADR-001). The hold is a lock file under `~/.agister/locks/in-place`,
whatever `AGISTER_HOME` says, named by the SHA-256 of the worktree
root's path, links resolved: the archive's, so the two Agisters
exclude each other on a worktree. `files` takes it with `flock`
without waiting, shared or alone, and the hold ends with the process
that took it. SIGHUP and SIGQUIT now cancel a run, as SIGINT does. It
no longer refuses a workspace's revision, clean or read-write access,
or a staleness limit on a model; on bash, which reports nothing to
watch, a staleness limit is still refused.

Decisions, each with its reason:

- No record of the worktree's changes yet (ADR-004, rule 4): the
  changes are in the worktree, and the record is runstore's.
- No recovery turn yet (ADR-006, rule 3): a stale call ends, and the
  caller reruns; resuming waits with sessions.
- Staleness is best effort: what a wrapper does not report is not
  watched, and a limit is kept to within a timer's tick.
- A dead owner's hold ends with it, though its programs may run on
  (ADR-001, "Reaping", asks them ended first): `flock` frees the hold
  when Agister dies, and Agister ends its programs on SIGINT, SIGTERM,
  SIGHUP and SIGQUIT. A kill it cannot catch, or a crash, leaves them;
  reaping is next (`backlog/run-path.md`).
- A tool command is timed from its call to the next line, not to its
  own result: best effort and simpler than pairing each call with its
  result; one command at a time is how both runtimes work in practice.
- Untracked files make a worktree not clean, as the archive held: an
  untracked file is content HEAD does not have.
- Clean is what `git status --porcelain` lists: files marked
  `assume-unchanged` or `skip-worktree` go unseen; Agister's worktrees
  do not set those marks.
- Admit checks, then holds: a writer that commits in between admits a
  pinned call on a HEAD just moved; a corner case, left.
- Tests that are detail, left to the implementer: a temporary folder
  for "/r", quiet from the turn's start, the end-to-end hold, a clean
  call admitted, a stale call's hold released.

## Parallel steps and a join

A workflow whose items include a parallel of steps runs: home's
`code_review`, as `agister run code_review --param goal=<path>`, its
five reviews on codex side by side, then its judge. What the archive
also did, keeping a record of the run and its calls, waits
(`backlog/run-path.md`).

**`core/workflow`** runs a parallel (ADR-011, rule 2): it calls each
of its steps at once, each with its own bindings, each step's start,
tool calls and end told to the events by its own name. Once all have
ended, the parallel completes, its outputs a list in declaration
order of each step's `{"status", "class", "output"}`: the class null
where none, the output null where the step did not complete. A step
that did not complete does not end the run: the join after it reads
what there is, and a run whose last item is a parallel completes, its
reason none. When the run is
cancelled, the parallel ends it once all its steps have ended,
interrupted, `cancelled`. Each step's cost, usage, warnings and
session count as a step's in sequence; warnings in declaration order.
The caller port is called from many goroutines at once, and the events
port too.

**The composition** plans a parallel's steps as it plans a step in
sequence: each admitted and held on its own, readers sharing the
worktree. Progress lines from steps side by side come as they come,
each printed whole. It no longer refuses a parallel of steps; it still
refuses, as not run yet, a parallel holding an item that is not a
step, and a field read within a parallel's outputs.

Decisions, each with its reason:

- No record of the run (ADR-011, rule 6): it is runstore's, and
  `code_review` reads nothing from one; the run's identity waits with
  it.
- A parallel's outputs are read whole: the judge takes them whole, and
  a step inside is read through the parallel (resolve's rule).
- Left as detail for the implementer: distinct bindings per step,
  a run cancelled before its parallel, a step spy completing after
  the run's cancellation, and the refusal rows' wording.
- No cap on steps side by side: a workflow declares how many there are.
- The loop's scripts move to this Agister when it replaces the
  archive's; until then they run the archive's, whose result they read.

## Records

Every run that reaches core is recorded (ADR-001, invariants 6 and 7,
"Runs"; ADR-004, rule 4): what a continuation will check, and who did
what. The record keeps what this slice needs, not yet all invariant 6
lists (`backlog/run-path.md`).

**`git`** gives a worktree's content: the id of the tree its files
would make, untracked ones too, ignored ones not, written through an
index of its own: a copy of the worktree's, in a temporary folder, so
the worktree's index is untouched and unchanged files are not hashed
again.

**`runstore`**, a wrapper, keeps runs under a folder it is given: each
run a folder of its id holding `record.json`, written whole each time
(a temporary file, then renamed; none left behind), and
`events.jsonl`, a line appended for each event, one append at a time.
It gives a record back by the run's id.

**`core/admit`** reads the worktree's content too, and tells a port of
its own, for each call it admits, the HEAD when admitted and the
content at the call's end, however it ended, read before the hold is
released; a fact it cannot read is told empty, and the call goes on as
before. A call refused tells nothing.

**The composition** gives each run an id: its start's UTC time and six
hex characters drawn at random, as `20261017T071618Z-55fd36`, a clock
and a source of randomness its seams. It places runs under home's
`runs`. Once settings resolve and the composition's own refusals, on
stderr, are past, it writes the record, `lost`, before anything runs;
then again as each call ends, and at the run's end as the run ended.
Refusals in the result, inputs' and admission's, are recorded. It
writes the record one write at a time, each holding every call ended
so far, steps side by side included. A first write that fails refuses
the run on stderr; a later one, or an event's append, is a warning in
the result. The record, schema `agister.record/v1alpha1`:

```json
{"schema": "agister.record/v1alpha1", "id": "<run id>",
 "request": {"workflow": "", "process": "", "agent": "",
   "params": {}, "dir": "", "continue": null},
 "started": "<RFC 3339>", "ended": null, "status": "lost",
 "calls": [{"id": "<run id>/<step>", "step": "", "process": "",
   "agent": "", "root": "", "head": "", "content": "",
   "continues": null, "result": {}}],
 "result": null}
```

A call's entry is written when it ends: its result in the printed
result's shape, session and reason in it; `head` and `content` empty
for a call refused, by inputs or by admission. The run's `result` is
the printed one. Each step's start, tool call and end, as core tells
them, is a line of `events.jsonl`:

```json
{"at": "<RFC 3339>", "step": "a", "kind": "started", "agent": ""}
{"at": "", "step": "a", "kind": "tool", "name": "", "input": ""}
{"at": "", "step": "a", "kind": "ended", "status": "", "class": null,
 "duration_ms": 0}
```

 The printed result gains `run_id`.

Decisions, each with its reason:

- Not yet in the record: the definitions with their digests, the
  inputs, the permission plan, a pinned call's patch (ADR-004, rule 4);
  the continuation needs none of them. ("Runs" adds the inputs, "A
  call's changes" the HEAD a call left and its patch.)
- A record starts `lost` and is rewritten as calls end: a run that dies
  reads as lost, never as running (invariant 7), its ended calls kept,
  with no reaper.
- Runs live under the home in use: the loop's is `~/.agister-next`. Run
  without `AGISTER_HOME`, this Agister reads the archive's home, which
  does not resolve here; nothing is recorded there in practice. Were
  it to resolve, a record would land among the archive's: a risk
  taken.
- No command on runs yet, and the id is printed only with the result:
  a lost run is found by its folder's time.

## Continuation

`agister run ... --continue <run id>` continues the session of an
earlier one-step run's call (ADR-001, rule 5; ADR-004, rule 5; ADR-012,
rule 1): the work goes on in the same worktree, in the same session.
A step inside a run continues one by a binding ("A binding continuing
a session").

**`cli`** takes `--continue <run id>` with either form of request; the
request carries it.

**`runstore`** gives the ids of the runs it keeps, in name order.

**`core/call`** takes a step's session and gives it to the turn, which
resumes it. A turn that reports another session fails the call,
`runtime_error`.

**claude-code** resumes a turn's session with `--resume <session>`.
**codex** runs `exec resume`, then the options it runs `exec` with,
the sandbox given as `--config sandbox_mode="<option>"`, since `exec
resume` takes no `--sandbox`; then the session, and `-`, the prompt
from stdin.

**home** ships the prompt `continuation`: what the agent is told of a
continuation (ADR-001, invariant 2).

**The composition**, once settings resolve and before the record is
first written, checks a continuation, each failure a refusal on stderr,
exit 1, nothing run and nothing recorded:

1. The request is one step: a step alone, or a workflow of one step.
2. The run named is kept; it is a run of one call, and that call has a
   session.
3. The session's latest call: of the runs runstore keeps, read newest
   first (their ids in name order are oldest first), the first holding
   a call whose session is that one.
4. The agent of the request's one step is that call's; the root of the
   worktree holding the launch directory is that call's root; the
   root's HEAD is the one that call left, and its content is the
   content that call recorded, not empty.
5. The prompt `continuation` resolves.

In its mapping to core, the composition gives the step's call the
session and the prompt `continuation` as its first document, its
inputs and other documents as for any call; in its mapping to
admission, it drops the process's request for a clean
worktree: the checks take its place (ADR-004, rule 5). The record's
request names the run continued, `"continue"`, and the call the latest
call's id, `"continues"` ("Records" gives the shape).

Decisions, each with its reason:

- The worktree is checked by the composition, as ADR-001's rule 5 and
  "Starting a run" say, not by admission, as its table of parts says,
  and before the hold is taken. Another writer
  ending between the check and the hold is a risk taken: the caller
  does not run two writers in one worktree (ADR-004, rule 6).
- The agent is the earlier call's: a session belongs to its runtime,
  and one agent is the plainest same runtime.
- The root names the worktree, and so its repository: no repository's
  identity is kept besides.
- The latest call is found by reading the records newest first: there
  are few, and no index is kept.
- A resumed codex turn's usage is the thread's, as codex reports it
  (ADR-001, invariant 3), its earlier turns counted.
- A continued call is given its process's inputs and documents as any
  call is: the step is the same one, the session knows the rest.
- Run ids sort by time to the second: two runs of one session in one
  second are not met.
- The agent's runtime is not checked again for sessions: one that no
  longer resumes them is a settings change a later run meets.
- A name an input shares with `continuation` is not refused: no
  process names one so.

## Recovery

A stale turn with a resume left is followed by a recovery turn in its
session (ADR-006, rules 3 to 5), where it used to end the call.

**claude-code and codex** give the session their stream reported for
a turn a signal ended too, read as it came: claude-code's from its
first line that names one, codex's from `thread.started`.

**`core/call`**'s runtime protocol grows: a turn's end carries the
session its runtime reported outside the reply, so a turn a signal ended
gives it too. Core/call takes a step's recovery: its budget of resumes,
none by default, and its instruction. When a turn goes stale, the call
has a resume left, the turn's session is known, and the same thing has
not gone stale before in this call, the call makes a recovery turn: the
turn as the step gives it, but in that session, its message the
instruction, a blank line, then what went stale; watched anew, under the
call's one time limit. Otherwise the call ends as a stale turn ends it
(rule 2). What follows a recovery turn follows it as it would any turn,
another recovery included. A recovery turn that reports a session other
than the one it resumed fails the call, `runtime_error`, as a
continuation's does. The call's cost and usage are its turns', summed,
each unknown where any turn reported none (ADR-001, invariant 3), as a
turn a stale end cut short does; its session the last a turn reported,
however it ended. A caller that cancels as a turn goes stale ends the
call interrupted, `cancelled`, with no recovery turn. Its report grows:
besides a tool call, a stale turn, what went stale and whether a
recovery turn follows.

**A tool command is timed until its result**, no longer until the next
line: claude-code prints lines while a command runs, a rate limit event
and a task started, so its `tool_command` limit never fired. Each
wrapper reports a tool's result as it reads it: claude-code's a user
event carrying a `tool_result`, codex's an `item.completed` of a tool
item it reports, a search reported only as it completes reported
called and done. The report port, from wrapper to core/call to the
watch, grows that kind. The watch ends a command's wait at a result
or at the next tool call; any line still restarts `no_event`.

**`core/workflow`** gives a call's stale report to its events port,
which grows a stale event, by the step's name, as it gives a tool
call. **`runstore`**'s event grows the kind `stale`, with `what` and
`recovering`.

**The composition** gives core a process's recovery, no longer
refusing it on a model. A stale turn is a progress line, `· <step>:
stale: <what>`, with `; recovering` where a recovery turn follows, and
an event:

```json
{"at": "", "step": "a", "kind": "stale", "what": "", "recovering": true}
```

**home**'s `implement` gets a recovery of one resume, its instruction
"Your last turn was ended: it stopped making progress, as said below.
Its work is in the worktree. Go on with the task another way."

Decisions, each with its reason:

- The record keeps a stale turn as an event, not in `record.json`:
  events are the run's history, and the result's shape does not change
  (rule 5).
- "The same thing" is the same words of what went stale: the same
  words make the same message, which tells the agent nothing new
  (rule 4). The watch names a tool, not what it was given, so two
  hung `Bash` commands are one thing; with home's one resume, it does
  not matter.
- No cost is left to check: no cost limit is run yet.
- End to end, a turn made stale in seconds, by a tool command limit
  of a few seconds and a prompt that sleeps, proves that each runtime
  resumes a session whose program was ended mid-tool.
- A command's wait ends at the first result, not its own by id: one
  command at a time is how both runtimes run in practice; claude-code's
  parallel calls end it early, best effort.

## Runs

A run's record holds what its calls were given, and `agister runs
export` copies a run out (ADR-001, invariant 6 and "Runs"; ADR-010,
rule 4): what `scripts/agister-gate`, the archive's last user, will
read of a review run once it moves to this Agister.

**The composition** records the inputs it resolves. The record's
`inputs` are the workflow's, as resolved at its boundary, in the order
the workflow declares them; a request
naming a step has none. Each call's `inputs` are its process's, as
resolved for its call, in the order the process declares them; a call
whose inputs were refused has none, and so has a run whose workflow's
were; none is `[]`. Each input is its name, its value whole, and its
identity. The run's inputs are in every write after they are resolved,
a call's in the write as it ends:

```json
{"inputs": [{"name": "goal", "value": "", "identity": "<sha-256>"}],
 "calls": [{"id": "", "inputs": [{"name": "", "value": "",
   "identity": ""}]}]}
```

The join's input is its call's like any other: the judge's `reviews`,
the reviews' outputs as it was given them.

**`runstore`** exports a run: its `record.json`, and its
`events.jsonl` where it has one, copied into a folder of the run's id
under the folder it is given, each made where missing; a copy already
there is written over, as the gate exports a run twice. A run not
kept is an error, and nothing is copied.

**`cli`** gets `agister runs export <run id> --to <dir>`, on a port of
its own, the composition's from runstore under home's `runs`; a
relative `--to` is joined to the directory cli is given, as `--dir`
is. It prints
nothing and exits 0; a failure goes to stderr, exit 1; a command not
whole prints its usage, exit 2.

Decisions, each with its reason:

- Values are kept in `record.json`, however long: ADR-010, rule 4
  asks the bytes kept, and one file keeps them; no artifact folder,
  not as ADR-001's table of parts gives `core/inputs` one. A value
  that is not UTF-8 is kept changed, its identity the original's: a
  risk taken, inputs are text.
- Not yet in the record: the definitions with their digests, the
  process's environment, the permission plan, a pinned call's patch
  (ADR-004, rule 4). No reader needs them yet.
- No `runs list` or `runs show`: the gate exports, and the record is a
  file to read.
- A run still being written exports as its files are at the copy: a
  record is written whole, so it reads as the record then; an event
  line may be cut. Best effort.
- `scripts/agister-gate` stays on the archive: moving it is its own
  slice, which reads this record. (Since "Retiring the archive": the
  gate is deleted; `runs export` is a person's.)

## Retiring the archive

This Agister becomes the installed `agister`, its home `~/.agister`;
the archive's binary and home are set aside. Its users move:
`rexlab/AGENTS.md` to this Agister's commands, and
`scripts/agister-gate` is removed, the loop's scripts doing its work.

**`scripts/agister-gate`** is deleted, with what names it: the step
`Gate` of `agister-core`, its path in `ci.yml`'s `agister` filter, its
row in `.github/workflows/README.md`, and its entry in
`scripts/tests/ci-workflow-paths.test.js`.

**`rexlab/AGENTS.md`** names this Agister's forms,
`agister/home/brief-forms`, and its commands: `agister run --process
implement --agent claude-opus --dir rexlab --param brief=<step>`, and
`agister run code_review --dir rexlab --param goal=<goal>`, with no
`--json`; it reads the result's `.status`, `.class` and `.reason`, an
implementation's `.output.output.checks`, `.summary`, `.notes` and
`.open`, a review's `.output.judgement`, and shows the workflow with
`agister inspect workflow code_review --dir rexlab`.

**`scripts/loop/install.sh`** builds the binary to
`~/.local/bin/agister` and writes home's settings, as shipped, into
`~/.agister`: each folder and file `agister/home` has replaced whole,
what it replaces first moved under `~/.agister/backups/<UTC time>/`;
what home has besides, `runs` and `locks` among it, untouched. It
refuses, changing nothing, while `~/.agister/briefs`, the archive's,
is there. It stands in for `settings/home` (ADR-008), not yet built.
A Go test runs it with `HOME` a temporary folder: refused with
`briefs` there; settings replaced, the old kept under `backups`, and
`runs` and `locks` kept. The loop's scripts run `agister`, with no
`AGISTER_HOME`; this branch's own rounds run trunk's scripts, on
`agister-next`, until the merge.

**The hold's lock** stays under `~/.agister/locks`, whatever
`AGISTER_HOME` says: runs on any home share the user's worktrees.
`hold.go`'s comments and `hold.feature`'s scenario say so, no longer
naming the archive.

**Once, after the merge**, before the first install: `~/.agister` is
moved to `~/.agister-archive`; `~/.agister-next`'s runs, where any,
to the new `~/.agister/runs` after the first install;
`~/.local/bin/agister`, `~/.local/bin/agister-next` and
`~/.agister-next` are removed. The
archive is rebuilt from `agister/archive` where ever needed, run with
`AGISTER_HOME=~/.agister-archive`.

`agister/README.md`, `agister/AGENTS.md` and `docs/process.md` say
so, keep "edit `agister/home`, not home's copy", and no longer name
`agister-next` or the archive's home.

Decisions, each with its reason:

- The gate is deleted, not moved: the loop's scripts implement and
  review on this Agister; its advisor step and unattended fix rounds
  are given up. `runs export` stays, for a person to copy a run.
- rexlab's implement loses the archive's verification, its tests run
  with up to 3 repairs: rexlab's agent runs `rexlab/scripts/test.sh`
  itself, as its AGENTS.md already says. The `.agister/verifies`
  files stay, unread, the archive's settings.
- The archive's home is moved aside, not installed over: its 4,000
  runs share this Agister's id and file names in another schema, and
  a continuation reads every run kept.
- The archive's binary is removed, not renamed: on the path, run
  without `AGISTER_HOME`, it would read this home.
- install.sh, not `settings/home`, writes home's settings until that
  is built (ADR-008, rule 1); its backups keep each write undoable
  (rule 2), by moving them back.
- A folder or file `agister/home` drops stays in `~/.agister` until
  removed by hand: a rename is rare.
- `agister/archive` stays, as reference, unbuilt.

## Reuse

`agister run ... --reuse <run id>` runs a request again, taking an
earlier run's completed calls where nothing they were given has changed
(ADR-001, invariant 8 and "Starting a run"; LAB-252): a review whose
judge failed, its five reviews completed, runs the judge alone.

**`cli`** takes `--reuse <run id>` with either form of request; the
request carries it. `--reuse` with `--continue` prints the usage, exit
2.

**`core/workflow`** tells a step's start when its caller says the call
starts, no longer before calling it: the caller's report grows
`Started`, and `Reused`, the id of a call it took in place of making
one. Core gives either to its events port, which grows `Reused`, and
tells a step's end only after its start.

**The composition**, once settings resolve and before the record is
first written, checks a reuse, each failure a refusal on stderr, exit
1, nothing run and nothing recorded:

1. The run named is kept.
2. Its request is this one's: the same workflow, or the same process
   and agent.

Each step's call, once its inputs resolve and before it is admitted, is
taken from the earlier run when that run holds a call of the same step
that completed, of the same process and agent, given inputs of the same
names, in the same order, with the same identities, and the worktree is
as that call left it: the root of the worktree holding the launch
directory is its root, the root's HEAD the one it left and its content
its content, not empty. A call taken is not admitted and not made: it
reports `Reused`, and its result to core is the earlier call's as
recorded, but for its cost, zero, and its usage, every count unknown,
which a sum skips: this run spent none. Any other call reports
`Started`, its inputs refused or not, and is made as it would be. The
record's request names the run reused, `"reuse"`; a call taken is
recorded as its earlier entry, cost and usage included, its id this
run's, its `"continues"` null, with `"reuses"`, the earlier call's id:

```json
{"request": {"reuse": "<run id>"},
 "calls": [{"id": "<run id>/<step>", "reuses": "<run id>/<step>"}]}
```

A call taken is a progress line, `· <step>: reused <call id>`, and an
event, runstore's kind `reused`, in place of its start and end:

```json
{"at": "", "step": "a", "kind": "reused", "call": "<call id>"}
```

A continuation's latest call (Continuation, check 3) is a call made,
never one with `"reuses"`, searched for back past the run named where
its call was reused: a session goes on from where it last ran.

Decisions, each with its reason:

- Not the checkpointing and resumption ADR-011 leaves out: a reuse is
  a new run, every step run through core as any run's; it only takes
  recorded results, and keeps no state between runs.
- A call is matched by what it was given, not by the earlier run's
  status: a run that failed, or was lost, gives the calls it completed.
- The worktree is compared at each call, not once at the start: a step
  that writes changes what the steps after it read.
- A call that failed is never taken: a failure is what a run again is
  for.
- The settings a call ran under are not compared: the record does not
  hold definitions or their digests yet (`run-path.md`, "The rest of
  the record"). A prompt or schema changed since is a risk taken;
  whoever reuses chose the run.
- Each call's cost and usage count once (ADR-011, rule 6) in a run's
  result: a run's are what it spent; a call taken keeps the earlier
  ones in its entry, which a sum over records skips.
- One run is reused, not a chain: a run that reused gives its calls,
  taken ones included, as recorded.

## Capacity

A turn that fails because the runtime's model is at capacity is retried
in the call, no longer the call's end (ADR-004, rule 8; LAB-249): a
review loses no node to it, and an implement run keeps its session.

**claude-code and codex** class it `capacity`, which joins core's
closed set of classes (ADR-001, invariant 3): claude-code a failed
result of the status 529, or "overloaded" in its words, before its
other classes; codex a `turn.failed` whose message says "at capacity",
before its other classes.

**`core/call`** retries a turn that ends by a reply of the class
`capacity`, while the call has made fewer than three turns of that end:
it waits on its timer, 30 seconds after the first such turn, 60 after
the second, then makes that turn again as it was given, its message and
all, in the session it reported, else in the session it was given. A
capacity turn that reported a session other than the one it resumed is
not retried: it fails the call, `runtime_error`, as any turn that
strayed does. No wait starts where the call's context has ended, or
where its time limit, read on its clock, leaves no more than the wait; a
wait the caller's context ends ends the call interrupted, `cancelled`.
A retry spends none of the step's recovery, and what follows it follows
it as it would any turn, a recovery turn included. The call's cost,
usage and session are its turns', as a recovered call's are. A call
whose last turn is at capacity, not retried, fails, `capacity`, its
reason the turn's, after "<n> of 3 turns at capacity: ". Its report grows a
turn at capacity: its reason, and the wait before its retry, none where
none follows.

**`core/workflow`** gives a call's capacity report to its events port,
which grows a capacity event, by the step's name, as it gives a stale
one. **`runstore`**'s event grows the kind `capacity`, with `reason`
and `retrying`.

**The composition** prints a turn at capacity as a progress line,
`· <step>: at capacity; retrying in <wait>`, the wait as the progress
prints a duration, or `· <step>: at capacity` where no retry follows,
and records an event:

```json
{"at": "", "step": "a", "kind": "capacity", "reason": "", "retrying": true}
```

Decisions, each with its reason:

- The policy is core's, not a setting: the owner chose one policy for
  every runtime, on by default; a process's own attempts and backoff
  wait until one needs them.
- A retry resumes with the step's own message, not a message of its
  own: the session holds the work done, and the task given again is
  what a message telling it to go on would say, from settings Agister
  already has.
- The wait is fixed, not drawn at random: the load is the provider's,
  which the few calls of a run retrying together do not change, and the
  owner chose one policy.
- A wait the time limit would cut is not started: the call ends at
  capacity, its cause, not at a timeout a caller would answer by raising
  the limit.
- Each turn at capacity is an event, not an entry in `record.json`, as
  a stale turn is: events are the run's history. The event keeps
  whether a retry follows, not its wait: the wait is the policy's, by
  the turn's place, and the next event's time shows it.
- A codex turn that failed reports no usage, so a retried codex call's
  usage is unknown: unknown, never zero (ADR-001, invariant 3).
- No cost limit bounds the retries: none is run yet (`run-path.md`).

## A binding continuing a session

A step of a workflow continues an earlier step's session, `session:
{from: steps.<item>.session}` (ADR-001, rule 5; ADR-004, rule 5;
ADR-011, rule 3; LAB-309): a summary goes on in the session of the
judge that read the reviews. It is no longer refused as not run yet.

**`settings/resolve`** refuses a step continuing the session of a step
on another agent: a session belongs to its runtime, and one agent is
the plainest same runtime, as a continuation's is. It refuses two steps
of one parallel continuing one session, each followed back through the
steps it continues to the first: two turns at once in one session are
not run.

**`core/workflow`**'s step names the step whose session it continues,
"" for none. The run gives its caller the session that step's call
reported, read from its results; where it reported none, the run is
refused, its reason `the step "<item>" reported no session`, the step
not called. Its caller port grows the session a step continues, "" for
none.

**`core/admit`**'s request grows the worktree a call continuing a
session must find: the HEAD and the content the session's latest call
left, as admit told them. Checked after the pin and
before the hold, a HEAD left not empty and not the worktree's now
refuses the call, `HEAD is "<now>", not the session's latest call's
"<head>"`; a content not the worktree's now, or either left empty,
refuses it, `the worktree is not as the session's latest call left it`.

**The composition** keeps, for the run, each session's latest call: its
id and the HEAD and content admit told at its end. A step's call
continuing a session is given that session, the prompt `continuation`
first among its documents, as a continuation's is, and admit the facts
its latest call left, no clean worktree asked: the check takes its
place; the record's call continues that call's id. A step that continues
a session, or whose session a step of the workflow continues, is made,
never taken by a reuse. Where the prompt `continuation` does not
resolve, the run is refused before its record is first written, as a
continuation's is.

Decisions, each with its reason:

- The session's latest call is the run's own: the binding reads a step
  of this run, and only this run's calls go on in it meanwhile. A call
  of another run in that session meanwhile is a risk taken: the caller
  does not run two writers in one worktree (ADR-004, rule 6).
- Admission checks the worktree, as ADR-001's table of parts says, not
  the composition, as a continuation's: here the facts are the run's
  own, kept in memory, and the hold is taken right after.
- Two steps of a parallel in one session are refused by settings, not
  at run time: a check there holds whatever the turns' timing.
- A step of a session's chain is never taken by a reuse: what a
  session held is not compared, and a session the earlier run went on
  in has moved past the call a reuse would take.
- The step is given its process's inputs and documents as any call is,
  as a continued call is.

## A call's changes

Every call records, at its end, the HEAD it left besides its content,
and a call that pinned its revision its changes from that revision as a
patch (ADR-004, rule 4; LAB-320). A session goes on from where its
latest call left the worktree, a commit included: an implement step that
commits is continued by the step after it.

**`git`** gives the changes between a commit and a tree, as `git diff
--binary` gives them: a patch that applies to the commit, binary files
included.

**`core/admit`** tells, of an admitted call, the HEAD at its end too,
read with its content, before the hold is released; empty where it
cannot be read. A call continuing a session is checked against the HEAD
its latest call left, no longer the one it was admitted at.

**`runstore`**'s call grows `"end_head"`, the HEAD it left, and
`"patch"`, null for none, else the path of its patch under the runs
folder, `<run id>/patches/<step>.patch`. It writes a call's patch whole,
as it writes a record, and a run exported takes its patches.

**The composition**, as a call admitted with a pin ends, its content
known, asks git the changes from the pinned commit to that content and
writes them before the call's entry; an empty change is an empty patch.
A patch that cannot be made or written is a warning in the result, as a
record's later write is, the entry's `"patch"` null. A call taken by a
reuse keeps the earlier entry's `"patch"`, the earlier run's file.
Wherever a call is compared with the HEAD an earlier one left, a
continuation, a session's latest call in a run and a reuse, the HEAD is
its `"end_head"`, else, for a record from before, its `"head"`.

```json
{"calls": [{"head": "<admitted>", "end_head": "<left>", "content": "",
  "patch": "<run id>/patches/<step>.patch"}]}
```

Decisions, each with its reason:

- A patch is a file beside the record, not in it: the record is
  written whole as each call ends, and a patch can be large.
- The patch runs from the pinned commit to the content the call left,
  commits included: what the call changed from what it was given,
  whatever it committed on the way.
- It is made after the hold is released: the commit and the tree are
  objects git keeps, not the worktree, which may change meanwhile.
- An unpinned call keeps no patch: it was given no revision to diff
  from (ADR-004, rule 4).
- A record from before is read with its `"head"` as the HEAD it left,
  as runs then were checked; the record is read, never rewritten.
