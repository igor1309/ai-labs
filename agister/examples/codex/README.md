# Codex settings (opt-in)

Not installed by `agister init`: `agister check` refuses them as shipped.

- The mapping is not verified against a live Codex (no primitive lists a `verified` version).
- Both sandbox modes read files outside the workspace (`host.read`), which
  Agister never grants. A repository opts in for Codex in its own
  `service.toml`, by not listing `host.read` as state-reaching (as the
  home settings this repository keeps, `agister/home/service.toml`, do),
  knowing agents can then read Agister's state there. The
  `adversarial_review_sandboxed` process here allows `host.read`, as
  home's `review` base does, so with that opt-in
  the example review runs in Codex's read-only sandbox.
- Contract `codex/2` continues a session in place (`codex exec resume`),
  for a `resumable` process, but cannot limit cost, so calls under a cost
  limit are refused.

To use Codex, verify what each sandbox mode actually grants on your Codex
version, update `runtimes/codex.yaml` to match, copy these files into
`$AGISTER_HOME`, or into one repository's `.agister/` to try them there
only, and run `agister check --probe`. Every command runs `check` first, so
until these files pass it, every command in that scope stops.
