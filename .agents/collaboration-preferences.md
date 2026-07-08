---
date: 2026-06-03
model: claude-opus-4-8
description: "Collaboration preferences — always-on behavioral rules for working in this repo"
---

# Collaboration Preferences

Always-on rules. Read at session start; they apply to every task regardless of scope.

- Latest direct user instruction is the highest-priority source of truth for current scope.
- If the user narrows scope or corrects direction, immediately stop the previous plan and follow the new scope.
- Before making changes, restate the requested scope in one sentence and execute only that scope.
- At the first message of a session, before exploring the repo or acting, consult `using-dev-skills` to pick the ladder and invoke the matching skill (e.g. `cold-start-checkpoint`, `intake`, `process-gates` as the task warrants). This is the default, not optional.
- Follow the written plan/docs as the source of truth; do not invent steps or rename phases.
- Make small, reviewable changes. Stop after each step for human review only when the active plan declares `human-review-gated`; otherwise auto-continue after green gates and local commit.
- Add tests alongside changes, not later.
- Always run tests on code changes.
- Require scope-appropriate verification before declaring completion.
- Full test/build gates are required for code, config, dependency, CI, release, or generated-artifact changes.
- Docs-only changes do not require test/build runs unless the docs change executable examples, generated outputs, CI/release behavior, or package/tooling configuration.
- For docs-only changes, verify Markdown structure, required front matter, required sections, links/references when relevant, and git diff scope.
- Require scope-appropriate verification for each phase step before moving to the next step.
- Commit only when tests are passing for the current branch state.
- `trunk` is a protected branch. Never commit or push directly to `trunk`. All changes must go through a PR from a dedicated branch.
- PR merge strategy: use merge commit (`--merge`), never squash. Always use `--auto --delete-branch` flags.
- Protocols are owned by their client and MUST live in the same module. A protocol without its client is a violation.
- Keep scope minimal and explicit; avoid scope creep.
- Tests must cover reasonable edge cases for new or changed behavior.
- Versioning: bump only the packages with code changes, keep `package.json` and `package-lock.json` root versions aligned, and update lockfile entries when package versions change.
- After a costly investigation or multi-step operational procedure (release, deploy recovery, device debugging), capture the knowledge in an explicit project runbook/doc — exact commands, expected outputs, caveats, falsified hypotheses, and stop/escalation conditions — so a fresh session or a cheap agent can execute from the doc alone. Before declaring such work done, check the docs would suffice without re-derivation.
- Before spawning a subagent that will run shell commands, verify its command set is covered by `.claude/settings.json` permissions (or instruct it to use the allowlisted wrapper shapes); a delegated agent's permission prompts land on the user.
- Tool mechanics that repeatedly waste calls: Read fast-moving shared files (e.g. `docs/log.md`) immediately before every Edit — parallel-session merges and branch switches invalidate earlier reads; quote `===` separators in zsh (`echo "==="`); prefer `git -C <repo-root>` and absolute paths over relying on the shell's persistent cwd after any `cd`.
