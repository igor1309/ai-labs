# The judge policy has no cost limit

The repository's `.agister/policies/judge.yaml` stops the judge once it has
cost $2 (`max_cost_usd: 2`). The operator wants no cost cap: remove the
limit and its comment, as was done for the other policies on this branch.
Update any test, doc or setting that states or relies on this limit.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
