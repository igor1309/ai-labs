# LAB-8: the fan-out and join workflow

Implement ADR-003 (`agister/docs/adr/003-fan-out-and-join-workflow.md`),
rules 1 to 6 and its amendments to ADR-001. Read ADR-001, ADR-002 and
ADR-003 first. Work in the Go module `agister/`, except for the
repository settings named below.

## Behaviour

- A workflow definition in settings (the syntax is yours; keep it close to
  processes): name, params, fan-out nodes (unique node name, process) and
  one join node (node name, process). `agister run <name>` runs a workflow
  or a process through the same client contract; `agister check`,
  `process show` or its workflow equivalent and `runs show` cover it.
- `check` rejects: no fan-out node; a missing or duplicate node name; an
  unknown process; a join process that cannot receive the collection; a
  join process whose inputs take a caller-supplied param.
- Params resolved once, before any node starts; every fan-out node gets
  the same resolved values (a revision as its commit identity). The join
  never gets them.
- Fan-out nodes run concurrently, each an ordinary call with its own
  limits, workspace and evidence.
- Barrier: the join starts only when every fan-out node has ended and all
  completed. Otherwise no join; the workflow's result takes the status and
  class of the first unsuccessful node in declaration order.
- The collection: for each fan-out node in declaration order, the node
  name, process, run ID and recorded output, unchanged. It is the join's
  only input besides fixed values its process declares in settings. The
  join is a fresh call.
- The workflow's result: the join's status, class and output; usage and
  cost summed over every node, unknown if any node's is; timing covers the
  whole workflow. No workflow-only status, class or result field.
- A workflow run record: definition and input digests, each node's run ID
  and outcome, the barrier's state and which node blocked it, timing,
  result. Each node's run records its workflow run.
- Cancellation is terminal and serialized with node starts: after it, no
  node starts (the join included, even when every fan-out node completed);
  active nodes are cancelled; the workflow ends interrupted, cancelled. A
  reap after a killed CLI treats an unfinished workflow run like any
  unfinished run.

## Repository settings and docs

- `.agister/workflows/review.yaml` (or where your syntax puts it): the
  workflow `review` with params `base` and `candidate`, fan-out
  `architecture_review_codex` and `tests_review_codex`, join
  `review_judge`. Change `review_judge` so its only input is the
  collection (drop the `reviews` file param); keep its instruction's
  meaning and its prompt input. `agister run review --param base=<rev>
  --param candidate=<rev>` must work.
- `cmd/agister/repo_settings_test.go` runs every repository definition on
  fake runtimes; extend it to the workflow.
- An example workflow in `agister/examples` passing `agister check`.
- README: the workflow, the example, and the failure and cancellation
  semantics.
- Do not delete `scripts/review-bundle.py`; I remove it after checking.

## Tests

Normal, deterministic tests with the fake runtimes and `t.TempDir()`
repositories; no real clock deciding a result, a deadline only as a hang
guard. Fan-out waits on a seam (a blocking fake or spy), never on timing.
At least: two fake fan-out nodes and one fake join, the join receiving both
outputs without loss or duplication; deterministic order when completion
order is reversed; every fan-out node given the same resolved revision; no
join before the barrier; no join after a refused, failed or interrupted
node, and the result names the blocking node; the join receives nothing but
the collection; cancellation before the join starts and during fan-out;
the record's parent and child links; each `check` rejection above.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
