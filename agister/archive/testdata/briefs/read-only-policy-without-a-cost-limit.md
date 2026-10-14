# The example read-only policy has no cost limit

`agister/examples/settings/policies/read-only.yaml` (installed by
`agister init`, used by the example `ask` process) sets
`max_cost_usd: 1`. A runtime that cannot enforce a cost limit (Codex,
contract codex/2) is refused for every call under that policy, so `ask`
cannot run with a Codex agent at all, and $1 is no meaningful bound for a
read-only question anyway.

Remove the limit from that policy. Update whatever tests, docs or
comments state or depend on it (search for them); change nothing else.
A test proves `ask` with an agent on a runtime that cannot enforce a cost
limit is no longer refused for it, if the existing tests do not already.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
