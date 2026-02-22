---
date: 2026-02-22
model: gpt-5.2
description: "Implementation plan to refactor GitHub Actions into reusable core workflows, a tag-driven release pipeline, and shared Telegram failure notifications."
---

# Workflow Release Refactor Plan (Core + CI + Release)

## Purpose

Refactor GitHub Actions so:
- `CI` stays as-is from an operator point of view (push/PR/manual checks), but delegates work to reusable workflows.
- `Release` runs on tag push and performs stricter gates (core checks → web-e2e → deploy worker/pages).
- Telegram failure notification is a shared reusable script used by all workflows/jobs.

## Scope

In scope:
- Workflow refactor under `.github/workflows/`.
- Extracting a shared Telegram notify script (bash).
- Adding a tag-triggered `release` workflow that deploys after gates pass.

Out of scope (unless required by a step):
- Any app logic changes.
- Any changes to deployment topology or Cloudflare project naming.
- Changing the existing test commands (keep using `./scripts/run_silent.sh ...` in this repo).

## Current State (as of 2026-02-22)

- `.github/workflows/ci.yml` runs tests + an optional real-provider smoke and includes an inline Telegram notification job.
- `.github/workflows/web-e2e.yml` is manual-only (`workflow_dispatch`) and not reusable.
- There is no tag-driven release workflow and no CI job that runs on tags.

## Target State

- `core` reusable workflow (callable) that runs the baseline checks used by both CI and release.
- `core-web-e2e` reusable workflow (callable) that runs web E2E checks.
- `ci.yml` becomes mostly triggers + “call core” + optional extra jobs, and uses shared Telegram notification on failure.
- `release.yml` triggers on `v*` tags and runs:
  1) core checks (fail fast)
  2) web-e2e (fail fast)
  3) deploy worker + pages (only if gates pass)
  4) Telegram notify on failure

## Execution Lock (for implementation)

Worktree required: yes  
Expected worktree: `worktrees/<slug>` (example: `worktrees/oracle-release-workflow-refactor`)  
Expected branch: `codex/<slug>` (example: `codex/oracle-release-workflow-refactor`)  
Preflight check: [ ] done

Note: this plan document is drafted/committed on `trunk` by request. Actual implementation must happen in a separate worktree/branch per the lock above.

## Verification Conventions

- Use `./scripts/run_silent.sh` wrappers, not direct `npm test` / `npx tsc`.
- Each step ends with a local verification gate (where applicable) plus a focused workflow sanity check (lint-style review of YAML, and reusing existing commands).

## Step 1 — Extract reusable “core” workflow

### Goal
Create a reusable workflow callable via `workflow_call` that runs the current baseline CI checks (tests + typecheck/build gate).

### Changes
- Add `.github/workflows/core.yml`:
  - `on: workflow_call`
  - Job runs:
    - `npm ci`
    - `./scripts/run_silent.sh "build" npx tsc --noEmit`
    - `./scripts/run_silent.sh "tests" npm test`
- Update `.github/workflows/ci.yml` to call `core.yml` instead of duplicating the steps.

### Notes / Decisions
- Keep current job naming stable where feasible to reduce CI noise.
- Preserve existing `real-provider-smoke` behavior (either keep it in `ci.yml` or optionally move it into its own callable workflow later).

### Gate
- Local: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Local: `./scripts/run_silent.sh "tests" npm test`
- Review: verify `.github/workflows/ci.yml` still triggers on push/PR/manual and delegates to `core`.

## Step 2 — Extract Telegram notify into a shared bash script

### Goal
Remove inline YAML scripts and reuse a single notification implementation everywhere.

### Changes
- Add `scripts/ci/notify_telegram_failure.sh` (bash, no backslash continuations) that:
  - Accepts message text as the first positional argument.
  - Uses `CI_BOT_TOKEN` and `CI_CHAT_ID` env vars.
  - Sends a message via Telegram Bot API (`sendMessage`).
- Update `.github/workflows/ci.yml` and `.github/workflows/web-e2e.yml` to call the script in their notify job/step.

### Notes / Decisions
- Prefer a small interface: one required message string, plus optional metadata.
- Build the message text in YAML, then pass it to the script as an argument (keeps script generic).

### Gate
- Review: ensure all workflows use the shared script and no longer embed long inline curl blocks.
- Optional local smoke (no secrets): run the script with dummy env vars and confirm it fails with a clear error message.

## Step 3 — Make web-e2e reusable (callable)

### Goal
Allow `release.yml` to run web-e2e without duplicating the job logic.

### Changes
- Add `.github/workflows/core-web-e2e.yml`:
  - `on: workflow_call`
  - Job runs:
    - `npm ci`
    - `npx playwright install --with-deps chromium` (with `PLAYWRIGHT_BROWSERS_PATH` pinned as today)
    - `./scripts/run_silent.sh "web-e2e" node --test oracle/apps/am-i-done-web/tests/web-e2e.test.js` with `RUN_WEB_E2E=1`
- Update `.github/workflows/web-e2e.yml` to call `core-web-e2e.yml` (and keep `workflow_dispatch`).

### Gate
- Local: `./scripts/run_silent.sh "tests" npm test` (keeps repo baseline)
- Review: confirm `web-e2e.yml` remains runnable manually but is now a thin wrapper.

## Step 4 — Update Oracle docs (README + log) for core workflow refactor

### Goal
Make the Oracle project’s operator docs reflect the workflow refactor work from Steps 1–3.

### Changes
- Update `oracle/README.md` to document the CI workflow structure at a high level:
  - CI delegates to a reusable `core` workflow.
  - Web E2E delegates to a reusable `core-web-e2e` workflow.
  - Telegram failure notifications use a shared bash script.
- Add a short entry to `oracle/docs/log.md` describing the workflow refactor (Steps 1–3) so operator-facing changes are discoverable in project history.

### Gate
- Review-only (docs).

## Step 5 — Add tag-driven release workflow

### Goal
On `v*` tag push, run the full release pipeline: core → web-e2e → deploy worker/pages.

### Changes
- Add `.github/workflows/release.yml`:
  - `on: push: tags: ["v*"]`
  - Jobs:
    1) `core` (uses `.github/workflows/core.yml`)
    2) `web-e2e` (uses `.github/workflows/core-web-e2e.yml`)
    3) `deploy` (needs both, runs `npm run worker:deploy` then `npm run web:deploy`)
    4) `notify` (runs on failure, uses `scripts/ci/notify_telegram_failure.sh`)
- Update `oracle/README.md` to document the release trigger and release pipeline stages.
- Add a short entry to `oracle/docs/log.md` describing the new tag-driven release workflow and its gates.
- Add a guard:
  - Tag version must equal root `package.json` version (same pattern as sister repos).
  - Optionally: ensure tag commit is on `trunk` (prevents accidental releases from detached/feature commits).

### Required Secrets / Vars
Document (in workflow comments or a follow-up doc) the required Cloudflare credentials:
- Secrets/vars needed by `wrangler deploy` and `wrangler pages deploy` (token/account id/project config).

### Gate
- Local: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Local: `./scripts/run_silent.sh "tests" npm test`
- Review: sanity-check `release.yml` for secrets usage, permissions, and `concurrency`.

## Step 6 — Align repository docs with behavior

### Goal
Ensure the repo’s “Release Process” text matches what actually happens.

### Changes
- Update `/AGENTS.md` release section to reference the new `release.yml` behavior (tag-driven).
- Optionally add a short operator runbook (if desired) describing:
  - version bump
  - tagging
  - how to verify release succeeded
  - failure handling (“do not reuse failed tag”)

### Gate
- Review-only (docs).
