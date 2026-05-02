---
date: 2026-04-20
model: claude-opus-4-6
description: "Planned improvements to pr-ci-watch skill: add gh run watch support"
---

# pr-ci-watch: Add `gh run watch` Support

## Context

`gh pr checks --watch` covers all checks at the PR level (status table, merge gating).
`gh run watch` operates at the workflow run level — streams live logs and exits with the run's conclusion.
They complement each other; `gh run watch` should not replace `gh pr checks --watch` as the default.

## Where to add `gh run watch`

1. **After re-running a failed check** — `gh run rerun <run-id>` then `gh run watch <run-id>` to stream the retry live instead of polling.

2. **When the user wants to watch a specific workflow** — e.g., "watch the deploy workflow" or "watch run 12345".

3. **As an alternative foreground watcher** when there's only one relevant run and the user wants log output, not just a status table.

## Sections to update in SKILL.md

- Add a "Run-level watching" section describing `gh run watch <run-id>` usage, timeout, and foreground/background behavior.
- Update "On failure" to use `gh run watch` after `gh run rerun`.
- Keep `gh pr checks --watch` as the default for "is the PR green?" scenarios.
