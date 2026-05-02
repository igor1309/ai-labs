---
date: 2026-04-23
model: gpt-5.4
description: "Implementation plan to close the remaining mvp_01 frontend gaps before PR creation"
status: implemented
type: plan
---

# Notio Frontend Gap Closure

## Review

### Finding 1 — Missing runnable app entry and composition root

- Verdict: fail
- Why: the current branch implements the feature modules and their tests, but not the actual SPA entrypoint required by the frontend contracts. The auth-session spec names `notio/frontend/src/main.ts` as the composition root, and frontend ADR-006 pins a concrete SPA layout with `index.html`, `src/main.ts`, and `src/app.svelte`. Without that entry layer, the slice is not a runnable frontend and the spec set is only partially integrated.
- References:
  - `notio/docs/specs/auth-session-v0.0.1.md:21`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:62`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:85`
- Fix:
  - Add the missing SPA entry files required by ADR-006: `notio/frontend/index.html`, `notio/frontend/src/main.ts`, and `notio/frontend/src/app.svelte`.
  - In `src/main.ts`, read config via `readConfig()`, create the shared `SupabaseClient`, construct `SupabaseAuthSession` and `SupabaseBrowseItemsReader`, and mount the app.
  - In `src/app.svelte`, keep the shell thin: wire the auth session and browse view together, show the minimal magic-link sign-in surface when unauthorized, and keep all browse state inside `BrowseView`.
  - Do not add extra product behavior beyond the existing ADR/spec surface.
- Tests:
  - Keep the existing frontend unit suite green.
  - Add at least one app-level integration/smoke test proving the entry shell composes the existing modules without type/runtime wiring errors.

### Finding 2 — `build` is typecheck-only instead of a real Vite bundle

- Verdict: fail
- Why: the package currently reports success for `npm --prefix notio/frontend run build` because `build` runs `tsc --noEmit`. ADR-006 requires a real `vite build` that emits a static bundle for Cloudflare Pages. A green typecheck is not evidence that the frontend can actually bundle or deploy.
- References:
  - `notio/frontend/package.json:6`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:89`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:100`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:163`
- Fix:
  - Split package scripts into explicit `typecheck` and `build` commands.
  - Make `build` run `vite build`.
  - Keep the Vite config aligned with a static output to `dist/`.
  - Ensure missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` fails the real build path, not only isolated unit tests.
- Tests:
  - Run the frontend unit suite.
  - Run `npm --prefix notio/frontend run typecheck`.
  - Run `npm --prefix notio/frontend run build` and verify `notio/frontend/dist/` is produced.

### Finding 3 — Required CI/env scaffolding is missing

- Verdict: fail
- Why: ADR-006 requires a dedicated `notio-frontend-core` workflow and a checked-in `.env.example` documenting the client-exposed Supabase vars. Neither file exists on the branch, so the slice does not satisfy its CI/deploy contract and is not PR-ready as a complete frontend unit.
- References:
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:46`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:47`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:89`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:94`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:163`
  - `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md:165`
- Fix:
  - Add `notio/frontend/.env.example` containing only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` placeholders.
  - Add `.github/workflows/notio-frontend-core.yml` that installs only `notio/frontend` dependencies and runs typecheck, tests, and the real Vite build.
  - Ensure the workflow and tracked env examples do not mention any service-role variable.
- Tests:
  - Re-run the local frontend gates after adding the files.
  - Sanity-check the workflow contents against ADR-006 before push.

## Goal

Close the remaining gaps between the implemented frontend modules and the `mvp_01` frontend ADR/spec slice so the branch can pass the real frontend gates and support PR creation.

## Execution Lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-frontend-gap-closure`
- Expected branch: `codex/notio-frontend-gap-closure`
- Preflight check: [x] done — overridden by direct user instruction to work in this worktree on branch `notio-frontend`

## Scope Guardrails

- Close only the three review gaps above.
- Reuse the existing `browse`, `auth`, and `config` modules; do not redesign their public contracts unless a blocker is proven.
- Keep the app shell thin and spec-driven; no search, filters, detail views, writes, SSR, Pages Functions, or extra product features.
- Keep changes inside the frontend slice and its directly required CI/docs files.
- CI changes may touch only `.github/workflows/notio-frontend-core.yml` and the repo-level `.github/workflows/ci.yml` dispatch/report wiring needed to make that workflow reachable.
- Build-time env validation must run during `vite build`; runtime-only validation from `src/main.ts` is not enough because Vite does not execute app code while bundling.

## Per-Step Closeout

After each step:

1. Self-review the step against this plan and the cited ADR/spec rules.
2. Fix any issues found before moving on.
3. Run the targeted verification listed in the step.
4. Commit only the files for that step.
5. Mark only the checkboxes backed by passing evidence.
6. Continue to the next step once the current step is committed and its gates are green; do not stop for review between steps unless a gate fails or the user explicitly interrupts.

## Steps

### Step 1 — Add the runnable SPA shell and composition root

**Objective**: turn the implemented modules into a real frontend app without widening product scope.

**Key work items**:

- Create `notio/frontend/index.html`.
- Create `notio/frontend/src/main.ts` as the composition root named by the specs.
- Create `notio/frontend/src/app.svelte` as the thin shell named by ADR-006.
- Wire `readConfig()`, `SupabaseAuthSession`, `SupabaseBrowseItemsReader`, and `BrowseView` together through a single shared Supabase client.
- Provide the minimal unauthorized/authenticated shell behavior needed to exercise the existing auth and browse modules.
- Add an app-level smoke/integration test under `notio/frontend/tests/` that imports/renders the shell with fakes and proves the new app layer composes without pulling Supabase SDK symbols into UI code.

**Dependencies**: none.

**Risks**:

- App-shell behavior is not separately spec'd, so the implementation must stay minimal and defer feature logic to the existing modules.

**Targeted verification**:

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend current build gate" npm --prefix notio/frontend run build`

Note: at this step, `build` is still the existing typecheck-only script. Step 2 replaces it with the real Vite build and introduces the explicit `typecheck` script.

**Commit**:

- Commit the SPA shell and composition root once the targeted gates are green.

- [x] `index.html`, `src/main.ts`, and `src/app.svelte` added
- [x] App-level smoke/integration test added
- [x] Existing module tests still pass
- [x] Current build gate still passes before changing build semantics
- [x] Step 1 committed

### Step 2 — Replace fake build success with the real Vite build gate

**Objective**: make local and CI build success mean the frontend actually bundles.

**Key work items**:

- Update `notio/frontend/package.json` scripts to split `typecheck` from `build`.
- Make `build` run `vite build`.
- Keep `vite.config.ts` aligned with the static SPA output expected by ADR-006.
- Add build-time env validation in `notio/frontend/vite.config.ts` using Vite config-time env loading, not only `readConfig()` from app runtime.
- Ensure the real build path fails when either `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is absent or blank.
- Keep successful local/CI build commands supplied with non-secret placeholder values, for example `https://example.supabase.co` and `test-anon-key`.

**Dependencies**: Step 1.

**Risks**:

- Real bundling may surface missing entrypoint, environment, or Svelte integration problems that typecheck-only execution previously hid.

**Targeted verification**:

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `env -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY npm --prefix notio/frontend run build` fails with an error naming the missing env vars
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`

**Commit**:

- Commit the build-script and bundling changes only after all three frontend gates pass.

- [x] `package.json` exposes separate `typecheck` and real `build` scripts
- [x] `vite build` succeeds and emits `dist/`
- [x] Required env vars are enforced on the real build path
- [x] Missing-env build failure is verified before the successful placeholder-env build
- [x] Step 2 committed

### Step 3 — Add the required environment example and dedicated frontend CI workflow

**Objective**: satisfy ADR-006’s repo/CI contract for `notio/frontend`.

**Key work items**:

- Add `notio/frontend/.env.example` with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Confirm `.env` remains ignored in `notio/frontend/.gitignore`.
- Add `.github/workflows/notio-frontend-core.yml`.
- Keep the workflow isolated to `notio/frontend` dependencies and commands only.
- Include typecheck, tests, and the real Vite build in the workflow.
- Include a grep gate in `notio-frontend-core.yml` that rejects tracked frontend references to service-role-style variables such as `VITE_SUPABASE_SERVICE`, `SERVICE_ROLE`, or `service_role`; keep the check scoped to frontend tracked files so the workflow's own negative-check command does not self-match.
- Update `.github/workflows/ci.yml` so `notio/frontend/**` and `.github/workflows/notio-frontend-core.yml` trigger a `notio-frontend-core` reusable workflow job.
- Add the new `notio-frontend-core` job to the repo-level `report` and `notify` dependency/result lists so failures block CI like the other project cores.

**Dependencies**: Step 2.

**Risks**:

- Cross-project CI drift if the workflow installs or runs anything outside the frontend unit.

**Targeted verification**:

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
- `git grep -n "VITE_SUPABASE_SERVICE\\|SERVICE_ROLE\\|service_role" -- notio/frontend` returns no matches
- Sanity-check `.github/workflows/notio-frontend-core.yml` contains the service-role rejection gate and does not search itself in a way that fails on its own pattern

**Commit**:

- Commit the env example, dedicated workflow, and repo-level CI dispatch wiring together once the local frontend gates are green and the workflow content matches ADR-006.

- [x] `.env.example` added with only the two allowed client vars
- [x] `notio-frontend-core.yml` added and frontend-isolated
- [x] `.github/workflows/ci.yml` dispatches and reports `notio-frontend-core`
- [x] No service-role variable appears in tracked frontend files
- [x] Service-role grep gate is present in frontend CI
- [x] Step 3 committed

### Step 4 — Final gates, docs, and PR readiness

**Objective**: close the branch cleanly once the slice actually satisfies the review and ADR/spec contracts.

**Key work items**:

- Re-run the full frontend local gate set on the final branch state.
- Update `notio/docs/log.md` with the completed implementation outcome.
- Self-review the changed files against the three review findings and this plan.
- Move this completed plan from `notio/docs/plans/notio-frontend-gap-closure.md` to `notio/docs/plans/implemented/notio-frontend-gap-closure.md`.
- Ensure `git status` is clean before push.
- Push the execution branch and create the PR only after all prior steps are green.

**Dependencies**: Steps 1–3.

**Risks**:

- Hidden drift between the local branch state and the branch pushed for review.

**Targeted verification**:

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
- `git grep -n "VITE_SUPABASE_SERVICE\\|SERVICE_ROLE\\|service_role" -- notio/frontend` returns no matches
- Sanity-check `.github/workflows/notio-frontend-core.yml` contains the service-role rejection gate and does not search itself in a way that fails on its own pattern
- `git status --short`

**Commit**:

- Commit the final docs/closeout update and implemented-plan move only after the branch is green and clean.

- [x] Frontend tests pass
- [x] Frontend typecheck passes
- [x] Frontend Vite build passes
- [x] `notio/docs/log.md` updated for the completed work
- [x] Plan moved to `notio/docs/plans/implemented/notio-frontend-gap-closure.md`
- [x] Branch clean and ready for push/PR
- [x] Step 4 committed

## Done Criteria

- The three review findings in this plan are closed in code and docs.
- The frontend has a real SPA entrypoint and composition root.
- `npm --prefix notio/frontend run build` performs a real Vite bundle build.
- ADR-006-required scaffolding exists: `notio/frontend/.env.example` and `.github/workflows/notio-frontend-core.yml`.
- The repo-level CI workflow dispatches, reports, and notifies on `notio-frontend-core`.
- The real Vite build fails without the two required public Supabase env vars and passes with placeholder values.
- The local frontend gate set is green on the final branch state.
- This plan is moved to `notio/docs/plans/implemented/notio-frontend-gap-closure.md`.
- The implementation branch is ready for PR creation without open completeness gaps.
