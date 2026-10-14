# Host reads stay state-reaching in the shipped service

The branch changed the shipped `agister/examples/settings/service.toml` to
`state_reaching = ["host.write"]` so shipped `ask` runs on Codex. Review
(run 20261001T061748Z-a50deb) found that this lets an agent read Agister's
state directory, against ADR-001 rule 9 ("Agents cannot reach Agister's
state"). The owner ruled: restore the restriction.

- Restore `state_reaching = ["host.read", "host.write"]` and its comment in
  the shipped service.
- Restore what the branch reworded to match the lifted restriction
  (`agister/examples/codex/README.md`, the comment in
  `agister/examples/codex/runtimes/codex.yaml`, the entries in
  `agister/docs/findings.md`), so they state the restored behaviour. The
  README says in a line how a repository opts in for Codex: its own
  `service.toml` accepts host reads (as this repository's
  `.agister/service.toml` does), knowing rule 9 no longer holds there.
- Keep the shipped `read-only` policy's wider allowlist: with the opt-in it
  is what lets `ask` run on Codex.
- `TestShippedAskRunsOnACodexRuntime`: the unmodified shipped service case
  asserts the call is refused, naming host.read; the configured-service
  case still asserts completion. Keep the injected-runtime seam.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
