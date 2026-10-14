# The read-only policy grants what Codex's read-only sandbox grants

The shipped example process `ask` runs under the example policy
`agister/examples/settings/policies/read-only.yaml`, which allows only
`repository.read` and `repository.search`. Contract codex/2's read-only
mode also grants `repository.diff`, `repository.history.read`,
`process.execute` and `host.read`, so `agister run ask --agent <a Codex
agent>` is refused: "runtime codex: cannot enforce the effective
permissions". The operator wants `ask` to run on Codex out of the box:
add those four to the policy's `tools.allow`, as the repository's own
`.agister/policies/codex-review.yaml` does.

Prove it with a test: the shipped `ask` runs on a Codex runtime (a fake
one, as the existing tests use) and is not refused. Update any test, doc
or example that states the old allowlist.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
