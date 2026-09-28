# Codex settings (opt-in)

Not installed by `agister init`: `agister check` refuses them as shipped.

- The mapping is not verified against a live Codex (`verified_versions: []`).
- Both sandbox modes read files outside the workspace (`host.read`), which
  Agister never grants.

To use Codex, verify what each sandbox mode actually grants on your Codex
version, update `runtimes/codex.yaml` to match, copy these files into
`$AGISTER_HOME`, and run `agister check --probe`.
