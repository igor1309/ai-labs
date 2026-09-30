# Agister CLI

Runs **agent calls** whose agents, processes, permissions and output
contracts are settings, not code, and **workflows** of them: fan-out then
join. Architecture: [ADR-001](docs/adr/001-agister-cli-architecture.md),
[ADR-003](docs/adr/003-fan-out-and-join-workflow.md).

## Build and try

```bash
cd agister
go build -o bin/agister ./cmd/agister

bin/agister --help                # every command and option; needs no settings

bin/agister init                  # example settings into ~/.agister ($AGISTER_HOME or --home);
                                  # shows what it writes and asks you to type "yes"
                                  # (--force also replaces existing files; scripts: echo yes | ...)
bin/agister check                 # validate all settings; report discovered problems
bin/agister check --probe         # also ask each agent's runtime for its version
bin/agister check --tree          # what defines what: each process, what it uses, which file
                                  # (global or project, and what it overrides), unused definitions
bin/agister check --json          # the whole report, including that graph, as JSON

bin/agister agent list
bin/agister agent create reviewer --runtime claude-code --model opus --model-family anthropic --force
                                  # --force replaces an existing agent after you type "yes";
                                  # creating a new one asks nothing; an agent that would make
                                  # the settings fail check is refused before anything is written

bin/agister process list
bin/agister process show adversarial_review
bin/agister run adversarial_review --param base=main
bin/agister run ask --param question="What does cmd/agister do?"
bin/agister run ask --continue <run-id> --param question="And cmd/agister/main_test.go?"
bin/agister run ask --max-cost 0.25 --json       # print the node result as JSON

bin/agister workflow list
bin/agister workflow show review_panel
bin/agister run review_panel --param base=main --param architecture=docs/adr/001-agister-cli-architecture.md

bin/agister runs
bin/agister runs show <run-id>
bin/agister runs watch <run-id> --after <seq>
```

Every call ends in a **node result**, the same shape any future node will
have: `status` (`completed`, `failed`, `interrupted`, `lost`), an error
`class` when not completed (`refused`, `invalid_output`, `budget_exhausted`,
`rate_limited`, `timeout`, …), `output`, `usage`, `cost` with its source,
`timing`, `artifacts` (changes made in a checkout) and `session`. A verdict
in the output is output: routing on it is the caller's job.

Exit codes: `0` completed, `1` failed, `2` interrupted, `3` refused, `4` lost, `64` usage or invalid settings, `70` internal error, `130` stopped watching.

## Verification

A process may declare one verification command
([ADR-002](docs/adr/002-verify-and-bounded-repair.md)); the shipped
`implement` example does:

```yaml
workspace:
  checkout: candidate_revision   # required: verify runs only in a checkout the call owns
verify:
  command: make test             # one Bash command
  timeout: 10m                   # per run; required, at most the call's timeout
  max_attempts: 3                # runs, the first included; at most the service's max_verify_attempts
  instruction: >-                # what the agent is told when a run fails
    The verification command failed on your changes. Fix the cause.
```

**What runs, and when.** After a turn whose output is contract-valid,
Agister runs `bash -c <command>` in the call's checkout, in a process group
of its own, with your environment. It never runs after a refusal, or after
a turn that failed, was interrupted or lost, or returned invalid output:
that turn's status ends the node. A run passes on exit status 0 when it
left the checkout's content as it found it; a run that changes the content
(every file the checked-out revision tracks, even one matching
`.gitignore`, and untracked files that are not ignored) fails whatever its
exit status. The node completes only when the latest run passes, and the
`changes.patch` it keeps, applied to the checked-out revision, rebuilds
exactly the content that passed.

**Repair.** A failing run with attempts left goes back to the agent: the
call's own provider session is resumed in place, in the same checkout, with
the instruction, the command, its exit status and its output (the first and
last 8 KiB, with the full size and SHA-256). The repair turn is validated
like any turn, must report the same session, and the command runs again.
Repairs need an agent with `session = "resumable"` and a runtime that
resumes sessions, or a `max_attempts` above 1 refuses the call before its
first turn.

**Limits.** Each run is bounded by `verify.timeout`, and the call's timeout
bounds everything: every turn and every run. When either fires, the
command's whole process group is killed. The call's cost limit is one budget
for all its turns: each repair gets only what is left, and a turn whose cost
the runtime did not report blocks repair while a cost limit is in effect.
A run never repeats on content already checked in the call (a repair that
changed nothing, or went back to an earlier state), and a failure with the
same exit status and output as the one before stops the loop too.

| What happened | Status | Class |
|---|---|---|
| the latest run passed on unchanged content | `completed` | |
| a run exceeded `verify.timeout`, or the call's timeout fired | `interrupted` | `timeout` |
| the call was cancelled | `interrupted` | `cancelled` |
| a repair turn failed, was lost or returned invalid output | that turn's own | that turn's own |
| the last attempt failed | `failed` | `budget_exhausted` |
| no progress, a turn with no session, or the cost budget cannot be enforced | `failed` | `budget_exhausted` |

The result has the usual shape: the output is the latest turn's, usage and
cost sum every turn, and timing covers the whole loop. The record's
`attempts` (shown by `agister runs show`) keep, per attempt, the turn and
the session it reported, the content identity checked, the diff the turn
made (`artifacts/attempt-<n>.patch`, kept before the next turn starts),
and the run: command, directory, exit status, timing, bounded output, full
size and digest, and what the run changed if it did. The command's process
group is on the record while it runs, so if Agister itself is killed, the
next call's reap kills it with the checkout.

**The command runs with your authority**, not the agent's permissions, and
it can run code the agent wrote: a test, a `Makefile` target, a build
script. A process with `verify` therefore lends your authority to the
agent's code, including access to Agister's own state. `agister check` and
`agister process show` say so for every process with `verify`.

## Workflows

A workflow ([ADR-003](docs/adr/003-fan-out-and-join-workflow.md)) runs
several processes over the same inputs, then one process over their
results. It has one fixed shape: **fan-out** nodes, each a call of its
process, and one **join** node. The shipped example,
`workflows/review_panel.yaml`:

```yaml
schema: agister.workflow/v1alpha1
name: review_panel
type: workflow
input:
  params:                        # what the caller gives, as a process's params
    base: {default: origin/HEAD}
    candidate: {default: HEAD}
    architecture: {}
  values:                        # resolved once, before any node starts
    base: {source: git.revision, rev: "${param.base}"}
    candidate: {source: git.revision, rev: "${param.candidate}"}
    architecture: {source: param, name: architecture}
fan_out:                         # at least one; node names unique
  - {node: adversarial, uses: process:adversarial_review}
  - {node: architecture, uses: process:architecture_review}
join: {node: summary, uses: process:review_summary}
```

and its join, `processes/review_summary.yaml`, whose only input is the
collection:

```yaml
input:
  values:
    reviews: {source: workflow.collection}
```

`agister run <name>` runs a workflow or a process, whichever the name is;
`agister workflow show <name>` shows its nodes, what each receives, and
each node's process as a call would see it.

**Inputs.** The workflow's values are resolved once, before any node
starts. Each fan-out node receives, as its process's param of the same
name, every value its process takes a param for: a revision as its commit,
anything else as its text. So every fan-out node reviews the same commits,
even if a branch moves meanwhile. A workflow takes `--param` only: an
`--agent`, `--timeout`, `--max-cost` or `--continue` is refused, since
each node runs with its own process's agent and limits.

**Fan-out.** The fan-out nodes start together and run concurrently. Each
is an ordinary call, a run of its own, with its own limits, checkout,
evidence and exit path; each node's run records the workflow run it
belongs to (`parent`).

**The barrier.** The join starts only after every fan-out node has ended
and all of them completed. If any did not (refused, failed, interrupted,
lost), no join starts: the workflow ends with the status and class of the
first such node **in declaration order**, and its message names that node
and its run. There is no partial join.

**The collection.** The join receives, as its `workflow.collection` input,
a JSON list with one entry per fan-out node, in declaration order whatever
order they finished in: `node`, `process`, `run` and the node's recorded
`output`, unchanged (or its `text`, for a process whose output is text).
That and the fixed values its own process declares are all the join
receives: no workflow param or value, nothing from whoever started the
workflow. The join is a fresh call, never a continuation of a fan-out
node's session. The collection is kept with the workflow run
(`artifacts/collection.json`).

**The result.** The workflow ends in the same node result as a call: when
the join ran, its status, class, output and text are the join's. Usage and
cost sum every node that ran, and are unknown if any node's are. Timing
covers the whole workflow. There is no status, class or result field of
its own.

**The record.** The workflow run (`agister runs show <id>`) records the
workflow definition's path and digest, its resolved inputs, each node's run
and outcome (`workflow.nodes`), and the barrier (`waiting`, `passed`,
`blocked` with `blocked_by`, or `cancelled`).

**Cancellation** (Ctrl-C on `agister run`) is terminal. Once the workflow
is cancelled, no node starts, the join included, even when every fan-out
node has already completed; cancelling and starting a node are serialized,
so exactly one of them wins. Every node still running is cancelled, and
the workflow waits for each to end and release its checkout, then ends
`interrupted`, class `cancelled`, barrier `cancelled`. If Agister itself is
killed, each node's run is reaped by the next call like any other run: its
runtime and checkout are ended and it finishes `lost`. The workflow run,
which has no effects of its own, is left unfinished and reads `lost`
(`abandoned`), like any unfinished run.

**`check`** rejects a workflow with no fan-out node, a missing or duplicate
node name, a node whose process does not exist, a join process that cannot
receive the collection (no input with source `workflow.collection`, or more
than one), a join process whose inputs take a caller-supplied param (any
`input.params`, or an input with source `param`), a fan-out process that
takes the collection or needs a param the workflow does not pass, a value
no fan-out process takes, and a workflow named like a process. A process
that takes the collection, run on its own, is refused: only a join has one.

## Settings

```text
~/.agister/
  service.toml  agents/*.toml  processes/*.yaml  policies/*.yaml
  runtimes/*.yaml  schemas/*.json  workflows/*.yaml
                                      settings (validated by `check`)
  runs/<id>/  record.json events.jsonl provider.jsonl artifacts/
  logs/                               diagnostics
```

A repository can keep its own settings in `<repository root>/.agister/`, the
same way it keeps `.claude/` or `.agents/`, and so can any branch of it. They
apply wherever Agister runs inside that repository, and take priority over
global settings document by document: a project `agents/reviewer.toml`
replaces the global one, for any kind of setting, unconditionally: a project
may set anything, looser or tighter than the global settings. What is checked
is that the result composes. `agister check` verifies the composed
settings (references, limits composing service ⊇ policy ⊇ process,
enforcement on each runtime) and lists every override, and every call
re-verifies what it uses. `process show` and run records name each
definition's file and the global one it overrides. With `--debug`, Agister
says why no project settings apply; a `.agister` that is not a usable
directory fails the command. `init` and `agent create` write global
settings.

```text
<repository>/.agister/
  service.toml  agents/*.toml  processes/*.yaml  policies/*.yaml
  runtimes/*.yaml  schemas/*.json  workflows/*.yaml
                                      same layout, higher priority
```

Nothing works on settings that do not compose. The client itself
(`app.Gated`, so any client of the contract, not only the CLI) runs `check`
(without `--probe`) before every use and refuses with the report on any
problem: the CLI prints it and exits 64. `init` is exempt because it writes
the settings, and `--help` needs none. Cancelling a run is never refused,
and a run already started stays observable, so editing settings mid-run
cannot strand it. Passing is silent. Each gated operation reads the settings
once and checks that snapshot, then uses the same snapshot, so an edit landing
in between changes neither. Every call also re-validates what it uses and refuses
before the provider turn starts.

`init` and `agent create --force` overwrite files, so each first lists what
it would write and waits for you to type `yes`; any other answer writes
nothing. "yes" approves the plan that was shown: a file changed while you
were asked is not overwritten, and nothing more is written. Scripts pipe
the answer: `echo yes | agister init`.

Agister is a runner, not a guard. The settings are yours, and so is judging
them: Agister does not decide whether they are right, safe, trusted, too
expensive or too constrained for the task, and a project's settings are as
authoritative as your global ones. Running Agister in a repository applies
that repository's `.agister/`, including the commands its agents name, much
as running its `Makefile` would, and an agent allowed to write the
repository can change those settings for later calls. Review settings you
did not write before you run them.

Agister does not handle settings edited concurrently with its own writes or
calls. It serializes its own writes and gives each operation one consistent
read, but anything else changing the files at the same moment is yours to
avoid. That includes you, an editor, a sync, a `git pull` or an agent. An
edit landing while `init` or `agent create` writes can be lost, and a call
that starts while `init --force` is replacing files can see some old files
and some new ones.

`examples/settings/` is what `init` installs. `examples/codex/` is opt-in;
see its README.

## Test

```bash
cd agister
gofmt -l .                                  # must print nothing
go vet ./...
go test -race ./...                         # everything; ~5 s
go test ./internal/app/...                  # use cases against spies
go test -coverpkg=./internal/...,./cmd/... -coverprofile=cover.out ./... && go tool cover -func=cover.out | tail -1
```

| Level | Where | Doubles |
|---|---|---|
| Domain rules | `internal/domain/*` | none (pure) |
| Use cases | `internal/app` | spies on every interface a use case declares: payloads asserted, responses scripted |
| CLI | `internal/cli` | spy client |
| Adapters | `internal/adapters/*` | real files, git, subprocesses; fake runtime binaries |
| Runtime conformance | `runtimetest.Conformance` | same suite for every runner and decorator |
| Wiring | `cmd/agister` | real composition root, fake runtimes |
| Architecture | `internal/archtest` | dependency rules, no kind of work in code |

CI: `.github/workflows/agister-core.yml`, invoked from `ci.yml` for Agister
Go, module and example changes, selected policy changes, or CI workflow changes.
Documentation-only changes do not trigger it.

Known gaps and their triggers: [docs/deferred.md](docs/deferred.md). Ideas not yet planned: [backlog/](backlog/README.md). Live observations: [docs/findings.md](docs/findings.md).
