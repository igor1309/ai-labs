---
date: 2026-05-12
model: gpt-5
description: "Implementation plan for the pre-public Regentara to Reinix rename"
---

# Regentara To Reinix Rename Implementation Plan

Execution mode: auto-continue
Human review between tasks: no
Worktree mode: create new
Expected worktree: `worktrees/rename-regentara-to-reinix`
Expected branch: `codex/rename-regentara-to-reinix`
Push policy: no push
Final archive behavior: move this plan to `docs/plans/implemented/` in the implementation PR
Preflight check: [x] done

## Source Review

The rename is pre-public, so the implementation should be atomic and should not retain compatibility aliases for `regentara`, `.regentara`, or `regentara://` names.

Known touched surfaces:

- Project directory and workspace package: `reinix/`, root `package.json`, root `package-lock.json`.
- Runtime names: CLI binary, package name, debug labels, temporary directory prefixes, run storage, settings paths, schema and prompt URI schemes, composition factory names.
- Repo integration: `README.md`, `release-units.config.toml`, `scripts/loc-dashboard.sh`, `docs/loc-dashboard.html`, dashboard/documentation inventories.
- Docs and logs: current user-facing docs become Reinix; historical naming/research files should only retain old names where they explicitly discuss prior naming history.

## Step 1: Lock New Runtime Identity

- [x] Update tests that assert package, CLI, settings, schema, prompt, debug, run-store, local demo, and composition identity to expect `reinix`.
- [x] Run targeted Reinix tests and confirm they fail with assertions for old `regentara` behavior.
- [x] Rename implementation surfaces from Regentara/regentara to Reinix/reinix.
- [x] Run targeted Reinix tests until green.
- [x] Commit the code and targeted tests.

Targeted verification:

```bash
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" node --test reinix/tests/*.test.js
```

## Step 2: Update Repo Integration

- [x] Update workspace, root test script, lockfile workspace entries, release unit config, LOC dashboard script, dashboard data, README Components table, and project registry docs.
- [x] Run repo tests and build.
- [x] Commit integration updates.

Verification:

```bash
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit
```

## Step 3: Update Documentation And Logs

- [x] Update current docs, examples, ADRs, specs, landing page, and logs to use Reinix terminology.
- [x] Preserve explicit naming-history context only where the old name is the subject of the document.
- [x] Run Markdown/front-matter checks and final repo verification.
- [x] Move this plan to `docs/plans/implemented/`.
- [x] Commit final docs and plan archive.

Verification:

```bash
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit
rg -n "regentara|Regentara|REGENTARA" --glob '!node_modules/**' --glob '!worktrees/**' --glob '!vendor/**' .
```
