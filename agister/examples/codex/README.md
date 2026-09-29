# Codex settings (opt-in)

Not installed by `agister init`: `agister check` refuses them as shipped.

- The mapping is not verified against a live Codex (no primitive lists a `verified` version).
- Both sandbox modes read files outside the workspace (`host.read`), which
  Agister never grants.
- Contract `codex/1` neither continues sessions nor limits cost, so calls
  with `--continue` or under a cost limit are refused. Whether Codex should
  do either is an open question.

To use Codex, verify what each sandbox mode actually grants on your Codex
version, update `runtimes/codex.yaml` to match, copy these files into
`$AGISTER_HOME`, or into one repository's `.agister/` to try them there
only, and run `agister check --probe`. Every command runs `check` first, so
until these files pass it, every command in that scope stops.
