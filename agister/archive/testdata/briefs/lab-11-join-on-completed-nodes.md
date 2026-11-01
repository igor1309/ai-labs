# LAB-11: the join runs on the nodes that completed

Implement ADR-004 (`agister/docs/adr/004-join-on-completed-nodes.md`),
which amends ADR-003 rules 3 and 4. Read ADR-003 and ADR-004 first. Work
in the Go module `agister/`, except for the settings and prompt named
below.

## Behaviour

- The barrier waits until every fan-out node has ended. The join starts if
  at least one completed. If none completed, no join; the workflow's result
  takes the status and class of the first node in declaration order, as
  today.
- Cancellation is unchanged: a cancelled workflow starts no join.
- The collection holds every fan-out node in declaration order: node name,
  process, run ID, status and class; only a completed node carries its
  recorded output.
- The workflow's result is the join's; its record names each node that did
  not complete, and the CLI's progress lines say so.

## Settings, prompt and docs

- `prompts/code-review-judge.md`: one line saying an entry with no output
  (a review that did not complete) is not an approval, so it rules on no
  code for it. Bump its version. The prompt names nothing outside its own
  input (no workflow, no other process).
- README: the barrier and collection as ADR-004 says; the example
  `review_summary` join keeps working.

## Tests

Normal, deterministic tests with the fake runtimes and `t.TempDir()`
repositories; a deadline only as a hang guard; a timeout driven by the
fake clock or a command that never ends by itself. At least: one node
failed, one rate-limited and one timed out while the others completed, and
the join receiving the completed outputs and each other node's status and
class, in declaration order; every node failing, no join, the result the
first node's; cancellation before the join, no join; the record naming the
nodes that did not complete.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
