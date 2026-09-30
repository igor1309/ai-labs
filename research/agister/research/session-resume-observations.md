# Session identity and resume: live observations

Facts checked against the real runtimes, so they are not re-derived. Each
entry names the version and date it was observed on; re-check when the
runtime version changes. Background:
[runtime research](codex-claude-orchestrator-runtime-research.md).

## Both runtimes report the session ID; neither needs one chosen for it

| | Codex CLI | Claude Code |
|---|---|---|
| Version observed | codex-cli 0.159.2 (2026-09-30) | 2.1.285 (2026-09-30) |
| Where the ID arrives | `thread.started` event, `thread_id` (`codex exec --json`) | `session_id` on stream-json messages (`claude -p --output-format stream-json --verbose`) |
| Choosing the ID up front | not supported | `--session-id <uuid>` (optional) |
| Resume | `codex exec resume <thread_id> [PROMPT or -]` | `claude -p --resume <session_id>` |
| Resume keeps the same ID | yes: same `thread_id`, the earlier turn is remembered | yes: same `session_id`, the earlier turn is remembered |
| Fork on resume | not in `exec`; `codex fork` is interactive only | `--fork-session` (new ID) |

Consequence for Agister: the provider-reported ID is the only identity both
runtimes share. Choosing the ID before the turn is a Claude-only extra, and a
contract built on it excludes Codex.

## Codex `exec resume` flags (0.159.2)

`codex exec resume --help` lists: `-c/--config`, `--last`, `--all`,
`--enable`, `--disable`, `-i/--image`, `--strict-config`, `-m/--model`,
`--dangerously-bypass-approvals-and-sandbox`,
`--dangerously-bypass-hook-trust`, `--worktree`, `--thread-source`,
`--skip-git-repo-check`, `--ephemeral`, `--ignore-user-config`,
`--ignore-rules`, `--output-schema`, `--json`, `-o/--output-last-message`.

There is **no `--sandbox` flag** on `exec resume`. The sandbox mode is set
with `-c sandbox_mode="read-only"`.

## Codex read-only sandbox (0.159.2, 2026-09-30)

- `codex exec --sandbox read-only`: the agent read a file and ran
  `git show`; creating a file in the repository and writing under `/tmp`
  were refused ("Operation not permitted").
- `codex exec resume <thread_id> - -c sandbox_mode="read-only"` with
  `--json --skip-git-repo-check --ignore-user-config --ignore-rules
  -c approval_policy="never"`: same thread, the earlier turn remembered,
  `echo x > b.txt` refused ("operation not permitted: b.txt"), `cat a.txt`
  worked.
- The same read-only behaviour was first recorded on codex-cli 0.158.0
  (`.agister/runtimes/codex.yaml`).

## Operational notes

- A Codex model newer than the CLI fails with "model is not supported when
  using Codex with a ChatGPT account" and a warning that model metadata is
  missing: `gpt-6.1-sol` needed codex-cli 0.159.x; 0.158.0 rejected it.
- Upgrading Codex makes Agister refuse Codex calls until the runtime
  mapping lists the new version as verified (ADR-001 rule 4):
  "runtime mapping codex verifies no primitive for codex version 0.159.2".
- Codex under a ChatGPT plan reports no cost; `ccusage codex session --json`
  prices sessions at API rates by rollout (`~/.codex/sessions`). The rollout's
  `rate_limits` give the plan's 5-hour and weekly usage in whole percent.
- `agister run` resolves a `file` input's relative path from the current
  directory: run it from the repository root.

## Codex as reviewer (codex-cli 0.159.2, 2026-09-30)

Same candidate (ADR-002 draft, commit 2d8bd3e5), same prompt, through
Agister's `decision_review_codex`. Cost is ccusage's API-equivalent; the
ChatGPT Plus plan itself bills nothing per call.

| Model, effort | Wall time | Findings | Cost |
|---|---|---|---|
| gpt-6-sol, high | 154 s | 4 major | $0.27 |
| gpt-6.1-sol, medium | 153 s | 2 major, 2 minor | $0.19 |
| gpt-6.1-sol, high | 580 s | 4 major, 2 minor | $0.26 |

6.1 high found the most, at the cost of wall time, and is the default
reviewer (`.agister/agents/codex-sol.toml`). A second 6.1-high round on the
revised ADR took 510 s and $0.44 for one major finding.
