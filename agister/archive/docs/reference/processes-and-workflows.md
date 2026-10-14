# Processes and workflows

[Reference](README.md) · [Agister](../../README.md)

## Agents, processes and workflows

An agent, a process and a workflow each hold their own facts
([ADR-030](../adr/030-a-workflow-binds-a-process-to-an-agent.md)):

- An agent, `agents/<name>.toml`, is a runtime profile: `runtime`,
  `model`, `model_family`, `effort`, `command` and `skills`. It holds no
  limit and no session.
- A process, `processes/<name>.yaml`, is the work: its input, prompt,
  guidance, skills, output schema, verification and what it needs of the
  worktree. It names no agent. It holds its own limits:
  `workspace.access` (`read-only` when unset), `workspace.scope`,
  `tools.allow`, `tools.require` (the permissions the work cannot be done
  without), `isolation.deny`, `timeout` (required), `retry.max_attempts`,
  `max_cost_usd` and `stale`. `session: resumable` says its session may be
  resumed, by a repair turn, a recovery turn or `--continue`; unset, it is
  `fresh-only`. A process whose verification repairs, or whose
  `stale.recover.max_resumes` is above 0, must be `resumable`. Limits
  narrow from the service's ceilings to the process to the caller's
  `--timeout` and `--max-cost`; a nearer layer's field replaces a farther
  one's.
- A workflow, `workflows/<name>.yaml`, binds each node's process to an
  agent, and is the only thing `agister run` runs. `agent` is required on
  every node, and nothing else chooses one. A workflow has one of two
  shapes: a `fan_out` list of nodes run at once and a `join` run after
  them, with the workflow's own `input`; or one `call`, with no `input`,
  `fan_out` or `join`, which takes its process's params and is that
  call's one run, with one record naming the workflow, the process and
  the agent:

```yaml
fan_out:
  - {node: tests, uses: process:tests_review, agent: codex-sol-61}
join: {node: judge, uses: process:review_judge, agent: claude-opus}
```

```yaml
schema: agister.workflow/v1alpha1
name: implement_codex
type: workflow
call: {node: implement, uses: process:implement, agent: codex-sol-61}
```

`agister run <name>` names a workflow; a process's name is refused, with
the workflows that bind it. A node's call gets its process's skills, then
its agent's, each once. A layer rebinds a node: `fan_out` is a list, so a
layer that changes one node's agent gives the whole list; `join` and
`call` are maps, so a layer sets `join.agent` or `call.agent` alone.

A join receives the collection: for each fan-out node, in declaration
order, its status and class and, if it completed, its output. An entry
names no node, process or run; the workflow's record does, in the same
order ([ADR-034](../adr/034-the-join-is-given-outcomes-not-the-workflow.md)).

## Process bases

A process may extend one base, `extends: process:<base>`:

```yaml
schema: agister.process/v1alpha1
name: tests_review
type: process
extends: process:review
prompt: code-review-tests
```

The base extends nothing, and is not work: a node that binds it is a
problem of the workflow. It is checked through each process that extends
it, so it may leave out what each of them sets, `prompt` here. The base
is composed from its own layers first, then the extending process's
layers over it; maps merge by key, lists and scalars are replaced whole,
and `name` and `extends` are never taken from the base. A layer's partial
of the base reaches every process that extends it; a partial may not set
`extends`. `process show` and the record name the base for each field it
gave. Home's six reviews, the five code reviews and the ADR review,
extend its `review` base, which holds their permissions and limits.

A process extends a base of its own layer. The nearest layer file that
holds the whole process names its base, and that layer defines the base
too: its file of the base and the extending file together set every field
a process requires. A base only home has is no base for a process a
repository defines, and neither is a repository's partial of the base
that leaves a required field to home's file: `check` reports the process
and its run is refused. A repository still changes a process home
defines, or its base, with partials that do not set `extends`.

## Verification

A process declares its verification command inline, or names a document
that holds it: `verify: verify:repo` is `verifies/repo.yaml`, found like any
other composed document, project over repository over home. So a process shared
by every repository carries no command, and each repository states its own
once. A process whose named verification exists in no layer is not a
problem of the settings: `check` warns, and only calls of that process are
refused ([ADR-010](../adr/010-a-process-names-its-verification.md)). A
project fills `verifies/repo.yaml` in its own layer for `implement`, with
a command written from the worktree root (`cd agister && …`); launched
where no layer fills it, `implement` is refused.

## Prompts and guidance

A prompt the settings fix, such as a reviewer's instructions, is a document
too: `prompts/review.md`, the whole file its text, no header. A process
names one required `prompt` and a `guidance` list of further prompts,
empty when absent or `[]`. Names are literal, never interpolated, each
resolved from the nearest layer that has it; a missing name or an
unreadable prompt refuses the call. The agent receives its values, then
input `prompt`, then `guidance.<name>` in list order, each recorded with
its digest. `{source: prompt}` and `optional` are refused: ADR-028
supersedes [ADR-019](../adr/019-a-prompt-may-be-optional.md) and amends
[ADR-014](../adr/014-prompts-are-settings.md). Home's one `implement`
process takes prompt `implement` and the Go guidance; the workflows
`implement_codex`, `implement_opus`, `implement_sonnet`, `implement_pi`
and `implement_pi_glm` each bind it to one agent.

## Reviews and brief forms

The review workflows of [home/](../../home/), `code_review` and `adr_review`,
take a required `goal`: the file that says what the change is for, its
issue or brief. Every review node receives its text and the judge does
not; a finding's scope is `change`, `goal` or `outside`, and the judge
rules a `goal` finding as it rules a `change` one
([ADR-023](../adr/023-reviewers-know-the-goal.md)). The judge rules `fix`, `defer`, `reject` or `waive`, and
hands no question on: a reading the reviews do not settle with a quote
from the goal, an ADR or the code is rejected, and the intent reviewer
settles a reading from that record and quotes it in its finding
([ADR-031](../adr/031-the-judge-rules-on-the-quoted-record.md)).

A brief's form is a document too: `briefs/<name>.yaml`, schema
`agister.brief/v1alpha1`. Its `parts` are in order, each a Markdown
`heading` line such as `"## Intent"`, `required: true` or `false`, and
optionally `reads`, the exact text the part must hold, as `None.` for
Open, and `reference: file`, for a part whose first back-quoted path,
relative to the caller's directory, must exist; its `template` is the
text a caller copies, whose headings are the parts', each once and in
order. A `source: file` input may name the forms its text must have, with
literal names: `{source: file, path: "${param.brief}", form: [goal,
step]}`. A call whose text has none of them is refused before it starts,
exit code 3, naming the input, each form and each wrong part: a required
part missing, given twice or empty, a part that does not read as defined,
or a reference that names no file or one that does not exist. An input
without `form` is not checked. Agister checks the structure, never the
meaning. The forms are read with the call and recorded among its
definitions, and `process show` and `workflow show` give each input's
forms. `check` reports a form that exists in no layer as a problem
of the process or workflow that names it, and a broken form as a problem
of its own; `check --tree` shows each form under what names it
([ADR-026](../adr/026-the-brief-is-a-runs-input-contract.md) rules 3 to
5 and 8). The example settings ship `goal` (Intent, Done when, Out of
scope and Open required; Expected behaviour, Sources and Decisions when
they apply) and `step` (Goal, a reference to the goal file, Covers and
Open required; Acts on and Constraints when they apply), and in
[home/](../../home/) `implement` takes a `goal` or a `step` as its brief and
`code_review` a `goal` as its goal.
