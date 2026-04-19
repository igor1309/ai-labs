# AI Coder

Personal toolkit for AI-assisted software development. Agent-agnostic by design — instructions are version-controlled assets independent of any specific tool.

## Structure

| Path | Purpose |
|------|---------|
| `guides/` | Extended context docs — teach AI how to think (TDD, arch review, debugging, feature specs) |
| `prompts/` | Focused one-shot task instructions |
| `dev-skills/` | Development workspace for Claude Code skills; published to `igor1309/skills` via GitHub Actions |
| `tools/` | Small shell utilities (git worktree helper, account switcher, config link enforcer) |
| `sandbox/` | Experiments and WIP explorations — not published |
| `insights/` | Notes on AI tooling and usage patterns |
| `docs/` | Repo-level log and archive |

## Key Facts

- Skills are developed in `dev-skills/public/` and synced to `igor1309/skills` on push to `trunk`
- `sandbox/`, `research/`, `archive/` are excluded from publish via `dev-skills/public/.publishignore`
- Install published skills: `/plugin marketplace add igor1309/skills`
