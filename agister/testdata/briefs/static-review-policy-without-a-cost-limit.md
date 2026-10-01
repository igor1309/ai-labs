# The static-review policy has no cost limit

The shipped example policy `agister/examples/settings/policies/static-review.yaml`
stops a review once it has cost $3 (`max_cost_usd: 3`). The operator wants
no cost cap on reviews: remove the limit and its comment, as was done for
the example `read-only` policy
(`agister/testdata/briefs/read-only-policy-without-a-cost-limit.md`).

Update any test, doc or example that states or relies on this limit. Do not
touch other policies' limits.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
