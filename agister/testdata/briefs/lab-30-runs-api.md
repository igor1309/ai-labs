# LAB-30 part 1: record the agent profile, serve run summaries to the page

Multica LAB-30 asks the Agister pages to show, for each call, who did the
work and how, and to compare outcomes across runtime, model and effort.
Today `agister pages` serves settings only. This part adds the data: one
recording change and two read-only endpoints. The page itself is a later
part; do not change `index.html`, `repos.js` or `config.js`.

## 1. Record the agent profile a call ran as

A run record names its agent (`record.Agent`) and keeps the agent file's
path and digest, but not the effort or model the call asked for. Once the
agent file changes, a past run's effort is lost.

Add to `run.Record` (`internal/domain/run/run.go`) the agent profile the
call ran as: the model and effort asked for (each empty when the agent
leaves it to the runtime) and the session mode. Set it where the call
writes `record.Runtime` (`internal/app/calls.go`, near line 682) from
`res.Agent`. Keep `turn.model`, which is what the runtime reported. Records
written before this have no profile; reading them must still work. Do not
change `RecordSchema`: the field is additive and optional.

Test it in `internal/app` with the existing spies: a call whose agent sets
a model and effort records both.

## 2. Serve run summaries

In `pages/serve.go`, add two GET endpoints under the same loopback guard.
Runs live in `<agister home>/runs/<run-id>/` (`record.json`,
`events.jsonl`, `artifacts/`). Read them with the `run` domain types; the
pages package may import `internal/domain/...`. The server still writes
nothing.

- `GET /api/runs`: one summary per run, newest first, at most `limit`
  (query, default 200, max 1000). Skip a run whose record does not parse
  and count it in a `skipped` field.
- `GET /api/runs/{id}`: the summary of one run plus its record as stored.
  An id that is not a plain run directory name is a 400; a missing run is
  a 404.

A summary has, from the record:

- id, process, agent, created and finished time, status (`result.status`,
  or `running` when there is no result);
- implementor: runtime adapter and version, model (the recorded profile's,
  else `turn.model`), the reported model (`turn.model`), effort (the
  recorded profile's, empty when absent: never re-read the agent file);
- policy: effective timeout, cost cap, access and scope;
- outcome: verify attempts used and whether the last one passed (from
  `attempts`; none when the process has no verify), wall, turn and runtime
  ms (`result.timing`), cost in USD and its source;
- parent workflow run id when the run is a node;
- for a workflow run: its nodes (name, process, run, status) and, when
  its output has judge `items`, the count of items by ruling and by
  severity, and per source review (the `<review>` in `sources` entries
  `<review>#<finding>`, 1-based into the nodes that are not the join) the
  count of items it contributed to by ruling.

and from `events.jsonl` (missing or unreadable: leave these empty):

- skills used: a `TOOL_REQUESTED` whose `name` is `Skill` (its input's
  skill name), or whose input reads a `SKILL.md` (the skill is that
  file's parent directory name); each skill with its count.
- tool calls: the number of `TOOL_REQUESTED` events.

Put the summarising in its own file in `pages` (e.g. `runs.go`) as plain
functions over a runs directory, so the tests call them directly.

Also add `GET /api/runs/compare`: the summaries of completed and failed
non-workflow runs grouped by process, then by runtime adapter, model and
effort. Each group: runs, completed runs, pass rate (completed over runs),
mean verify attempts among runs with verify, median wall ms, total cost
and cost per completed run.

## Tests

`pages/runs_test.go`: build runs directories in `t.TempDir()` with
hand-written `record.json` and `events.jsonl` files and assert:

- a call record with a profile gives that effort and model; one without a
  profile gives empty effort and the reported model;
- verify attempts: two attempts, the second passed;
- a workflow record with judge items gives the ruling, severity and
  per-review counts;
- skills: one Claude `Skill` call and one Codex command reading
  `.agents/skills/x/SKILL.md` count as skills `<name>` and `x`;
- a run with an unparseable record is skipped and counted;
- the list is newest first and honours `limit`;
- `/api/runs/{id}` refuses `..` and a name with a slash (400), and a
  missing run is 404;
- compare groups two configs of one process separately, with the right
  pass rate, median and cost per completed run.

Extend `pages/serve_test.go` only as needed to exercise the routes.

Update `pages/README.md`: the new endpoints and what a summary holds, in
its existing style. Run the full check from `agister/` (its AGENTS.md)
and `node --test pages/tests/*.test.js`. Report each command with its exit
code and final line, and list every file you changed.
