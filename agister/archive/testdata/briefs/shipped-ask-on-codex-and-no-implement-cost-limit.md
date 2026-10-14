# Shipped ask runs on Codex; implement has no cost limit

Review of the branch (run 20261001T060021Z-d09b79) asked an owner question:
the shipped `agister/examples/settings/service.toml` lists `host.read` in
`state_reaching`, so shipped `ask` (policy `read-only`, now allowing what
Codex's read-only sandbox grants) is still refused on Codex. The owner
chose option (a):

- Change the shipped service so `host.read` is no longer state-reaching:
  `state_reaching = ["host.write"]`. Adjust its comment to say what the
  list now covers and why reading the host is granted where a policy
  allows it.
- Add a test that runs shipped `ask` on a (fake) Codex runtime with the
  unmodified shipped service and asserts it completes. Keep the existing
  configured-service test. Update any test, doc or example (e.g.
  `agister/examples/codex/README.md`) that states the old behaviour.

The owner also wants no cost cap on implementation:

- Remove `max_cost_usd` (and any comment about it) from the shipped
  `agister/examples/settings/policies/implement.yaml` and from the
  repository's `.agister/policies/implement.yaml`. Update tests, docs or
  examples that state or rely on these limits. Leave other policies'
  limits as they are.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
