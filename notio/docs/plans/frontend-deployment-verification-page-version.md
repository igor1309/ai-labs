---
date: 2026-04-24
model: gpt-5
description: "Implementation plan for Notio frontend ADR-007 deployment verification by rendered page version"
status: active
type: plan
---

# Notio Frontend Deployment Verification Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` if subagents are available, or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Notio frontend production deployment fail unless the deployed Cloudflare Pages app renders the expected frontend release version.

**Architecture:** Keep the frontend static-only. Add a small deployment verification path that derives the expected version from either the triggering frontend tag or checked-out frontend package metadata, then uses a browser-rendered DOM smoke check against the configured production URL.

**Tech Stack:** GitHub Actions, TypeScript, Svelte, Vite, Vitest, Playwright, Cloudflare Pages.

---

## Execution Lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-frontend-deployment-version-smoke`
- Expected branch: `codex/notio-frontend-deployment-version-smoke`
- Preflight check: [ ] done

Before any implementation edit, run the process-gate preflight and report:

- `git worktree list --porcelain`
- `git branch --show-current`
- `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`

If preflight fails, halt before editing.

## Governing ADR Set

- `notio/docs/frontend/adr/ADR-007-frontend-deployment-verification-page-version.md`
- `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md`
- `notio/docs/adr/adr-007-frontend-backend-release-split.md`

## Scope Guardrails

- Do not add a Pages Function, server route, API endpoint, backend proxy, or SSR runtime.
- Do not test login, Supabase reads, pagination, or authenticated product behavior in the deployment smoke check.
- Do not authenticate, mutate Supabase data, or depend on backend data availability.
- Do not verify preview deploys.
- Do not hard-code the production URL in multiple places.
- Do not change frontend product behavior except to preserve the existing visible version contract.
- Do not deploy, tag, push, or publish while executing this plan.

## ADR Traceability Matrix

| ADR invariant | Plan phase |
|---|---|
| Production deployment verifies the deployed page after `wrangler pages deploy` | Phase 3 |
| Tag-triggered deploys derive expected version from `notio-frontend_v<version>` | Phase 1, Phase 3 |
| Manual or ref-based production deploys derive expected version from `notio/frontend/package.json` | Phase 1, Phase 3 |
| Expected rendered text is `v<version>` | Phase 1, Phase 2 |
| Static workflow or script tests cover both expected-version sources | Phase 1 |
| Smoke check uses browser-rendered DOM, not raw `curl` HTML grep | Phase 2, Phase 3 |
| Version element remains present for checking, unauthenticated, and authenticated states | Phase 2 |
| Version element remains accessible by stable accessible name `Version` | Phase 2 |
| Deployment fails when page is unreachable, selector is missing, or version differs | Phase 2, Phase 3 |
| Verification target is the production frontend URL, not local dev or preview URL | Phase 3 |
| Production URL is supplied through workflow configuration or environment | Phase 3 |
| Smoke check does not authenticate, mutate Supabase data, or depend on backend data | Phase 2, Phase 3 |
| No frontend endpoint, Pages Function, SSR route, or backend proxy is introduced | Phase 2, Phase 3 |

## Phase 1: Expected Version Contract

### Objective

Define a tested contract for deriving the exact rendered version text expected by deployment verification.

### Files

- Create or modify: `notio/frontend/scripts/deploy-expected-version.mjs`
- Create or modify: `notio/frontend/tests/deploy/DeployExpectedVersion.test.ts`
- Modify only if needed: `notio/frontend/package.json`
- Modify only if needed: `notio/frontend/package-lock.json`

### Required Behavior

- A `notio-frontend_v0.1.1` tag produces expected rendered text `v0.1.1`.
- Manual or ref-based production deploy context produces expected rendered text from checked-out `notio/frontend/package.json`.
- Non-frontend tags are rejected rather than silently mapped to a version.
- The version contract strips the `notio-frontend_` prefix and does not include Git SHA data.

### Acceptance Criteria

- Automated tests fail if tag-derived expected version stops using the `notio-frontend_v<version>` format.
- Automated tests fail if package-derived expected version stops reading `notio/frontend/package.json`.
- Automated tests fail if expected text omits the leading `v`.
- Automated tests fail for an invalid frontend tag.

### Verification

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`

### Commit

- Commit message: `derive notio frontend deploy version`

- [ ] Expected-version helper exists
- [ ] Tests cover tag-derived expected version
- [ ] Tests cover package-json-derived expected version
- [ ] Invalid tag behavior is tested
- [ ] Verification passed
- [ ] Commit created

## Phase 2: Browser-Rendered Version Smoke Check

### Objective

Add a browser-based smoke check that validates the visible deployed version without exercising product behavior.

### Files

- Create or modify: `notio/frontend/scripts/smoke-deployed-version.mjs`
- Create or modify: `notio/frontend/tests/deploy/SmokeDeployedVersion.test.ts`
- Modify only if needed: `notio/frontend/package.json`
- Modify only if needed: `notio/frontend/package-lock.json`
- Modify only if needed: `notio/frontend/tests/App.test.ts`

### Required Behavior

- The smoke check loads the configured target URL through a browser-rendered DOM mechanism.
- The smoke check locates the element with accessible name `Version`.
- The smoke check passes only when the rendered text equals the expected `v<version>`.
- The smoke check fails deterministically when the page cannot be reached.
- The smoke check fails deterministically when the version element is missing.
- The smoke check fails deterministically when the rendered version differs.
- The smoke check does not authenticate, call Supabase directly, mutate data, or require backend data.
- Existing app tests continue proving the version element exists for checking, unauthenticated, and authenticated render states. If they do not currently cover all three states, extend them here.

### Acceptance Criteria

- Automated tests prove the smoke check uses a DOM/browser path instead of raw HTML grep.
- Automated tests prove missing selector, unreachable target, and version mismatch are failures.
- App-level tests prove the `Version` element remains available across all auth states.
- No file added by this phase creates a frontend server endpoint, Pages Function, SSR route, or backend proxy.

### Verification

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `VITE_SUPABASE_ANON_KEY=test-anon-key VITE_SUPABASE_URL=https://example.supabase.co ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`

### Commit

- Commit message: `verify notio frontend page version`

- [ ] Browser-rendered smoke script exists
- [ ] Failure modes are tested
- [ ] `Version` accessibility contract is tested for all auth states
- [ ] Static-only frontend boundary is preserved
- [ ] Verification passed
- [ ] Commit created

## Phase 3: Deployment Workflow Gate

### Objective

Wire the browser smoke check into the production Cloudflare Pages deployment path after `wrangler pages deploy`.

### Files

- Modify: `.github/workflows/notio-frontend-deploy.yml`
- Modify only if fan-in behavior changes: `.github/workflows/release-unit.yml`
- Modify or extend only if static workflow checks are needed: `scripts/release/tests/workflow-fanin.test.js`
- Modify: `.github/workflows/README.md`
- Modify: `notio/docs/log.md`

### Required Behavior

- The `notio-frontend-deploy.yml` workflow runs the smoke check after `wrangler pages deploy`.
- Release-tag workflow calls pass enough context for `notio-frontend_v<version>` tag-derived expected version.
- Manual or ref-based workflow runs use checked-out `notio/frontend/package.json` as the expected-version source.
- The production URL is supplied by workflow configuration or environment and is not duplicated across scripts.
- The smoke target is the production Cloudflare Pages URL, not a local dev server or preview URL.
- A failed smoke check fails `deploy-notio-frontend`, which prevents GitHub Release creation and is included in release failure notification.

### Acceptance Criteria

- Static workflow tests fail if `notio-frontend-deploy.yml` deploys without a subsequent page-version smoke step.
- Static workflow tests fail if the deploy workflow lacks a configured production URL input or environment.
- Static workflow tests fail if the expected-version source is ambiguous for either release-tag or manual/ref deploys.
- Static workflow tests fail if `release-unit.yml` stops treating `deploy-notio-frontend` as a release fan-in gate.
- Documentation names the production page-version smoke check as the Notio frontend release success condition.

### Verification

- `./scripts/run_silent.sh "release-tests" node --test scripts/release/tests/*.test.js`
- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `VITE_SUPABASE_ANON_KEY=test-anon-key VITE_SUPABASE_URL=https://example.supabase.co ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
- `./scripts/run_silent.sh "tests" npm test`

### Commit

- Commit message: `gate notio frontend deploy by page version`

- [ ] Deploy workflow runs the smoke check after Pages deploy
- [ ] Expected version source differs correctly for tag and manual/ref deploys
- [ ] Production URL is configured once through workflow environment or inputs
- [ ] Release fan-in remains covered
- [ ] Documentation and log are updated
- [ ] Verification passed
- [ ] Commit created

## Completion Definition

- The Notio frontend deploy workflow verifies the real production page after `wrangler pages deploy`.
- `notio-frontend_v<version>` deploys expect rendered text `v<version>`.
- Manual or ref-based production deploys expect rendered text from checked-out `notio/frontend/package.json`.
- The check uses browser-rendered DOM access to the `Version` element.
- Deployment fails if the page is unreachable, the version element is missing, or the rendered text differs.
- The frontend remains static-only with no Pages Function, server route, SSR route, or backend proxy.
- Automated tests cover expected-version derivation, smoke-check failure modes, auth-state version presence, and workflow wiring.
- All phase and final verification gates pass before the plan is moved to `notio/docs/plans/implemented/`.
