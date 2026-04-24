---
date: 2026-04-24
model: gpt-5
description: "Implementation plan for Frontend ADR-008 local browser-testing runtime"
status: planned
type: plan
---

# Notio ADR-008 Local Browser Testing Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` if subagents are available, otherwise use `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Frontend ADR-008 by adding an explicit Vite-served local browser-testing runtime for the Notio frontend that uses deterministic in-memory auth and browse adapters.

**Architecture:** Keep production composition on the existing Supabase-backed `AuthSession` and `BrowseItemsReader` adapters. Add a local-only composition branch selected by an explicit runtime flag, wiring local fake adapters under a clearly local/test-named source path. The same Svelte app remains the UI surface in both runtimes.

**Tech Stack:** TypeScript, Svelte, Vite, Vitest, Testing Library Svelte.

---

## Governing ADR Set

- `notio/docs/frontend/adr/ADR-008-local-browser-testing-mvp01-frontend.md`
- `notio/docs/frontend/adr/ADR-001-frontend-architecture-mvp01-supabase-browse.md`
- `notio/docs/frontend/adr/ADR-002-auth-model-mvp01-readonly-supabase-frontend.md`
- `notio/docs/frontend/adr/ADR-003-mvp01-product-scope-readonly-browse-frontend.md`
- `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md`

## Execution Lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-adr-008-local-browser-testing`
- Expected branch: `codex/notio-adr-008-local-browser-testing`
- Preflight check: [x] done

Before Step 1, run:

```bash
git worktree list --porcelain
git branch --show-current
```

Emit:

```text
Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>
```

If the worktree is not a separate dedicated worktree on the expected branch pattern, stop and create the correct worktree before editing files.

## Scope Guardrails

- Implement only ADR-008 local browser testing.
- Do not add Storybook, screenshot tests, browser automation, local Supabase, Cloudflare Pages Functions, SSR, a BFF, or production deployment behavior.
- Do not change production Supabase auth or browse adapter behavior except where needed to keep the composition boundary testable.
- Do not relax the ADR-001 Supabase SDK import allowlist.
- Do not add production mocks or mock data to Supabase adapter files.
- Keep local fake adapters under `notio/frontend/src/` in a clearly local/test-named module path.
- Keep local runtime selection explicit; absence of `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` must not silently select local mode.

## ADR Traceability Matrix

| ADR requirement | Planned phase | Acceptance signal |
| --- | --- | --- |
| `package.json` exposes `dev:local` | Phase 1 | `npm --prefix notio/frontend run dev:local -- --host 127.0.0.1` starts Vite without Supabase env vars |
| Local runtime selected by explicit local-only mode or env flag | Phase 1 | Test proves missing Supabase env vars do not enable local mode unless the explicit flag is present |
| Production composition root keeps using `SupabaseAuthSession` and `SupabaseBrowseItemsReader` | Phase 1 | Test proves default runtime composes Supabase-backed adapters and preserves build-time config checks |
| Local branch uses in-memory `AuthSession` and `BrowseItemsReader` | Phases 2 and 3 | Tests instantiate local runtime and observe fake auth plus fake browse behavior through public interfaces |
| Local fake adapters live under a local/test-named source path | Phases 2 and 3 | Source files live under `notio/frontend/src/local-browser-testing/` |
| Local fake adapters satisfy public interfaces | Phases 2 and 3 | Typecheck passes and unit tests exercise the adapters through `AuthSession` and `BrowseItemsReader` |
| Deterministic browse scenarios include loaded, empty, refresh, load-more, load-more-exhausted, and failure states | Phase 3 | Tests cover each named local scenario and its observable UI or reader outcome |
| Local auth enters authenticated UI without email or Supabase | Phase 2 | App-level test signs in through local auth and reaches BrowseView without calling Supabase |
| Local fake adapters do not import `@supabase/supabase-js` | Phases 2 and 3 | Grep gate finds zero SDK imports under `src/local-browser-testing/` |
| ADR-001 production SDK import allowlist remains intact | Phase 4 | Grep gate confirms SDK imports remain limited to `src/main.ts`, `src/browse/SupabaseBrowseItemsReader.ts`, and `src/auth/SupabaseAuthSession.ts` |
| No Cloudflare Pages Functions, BFF, SSR, or production deployment behavior | Phase 4 | Changed-file review shows no server/deploy topology files changed for local runtime behavior |
| CI still runs unit tests, typecheck, and production build gates | Phase 4 | Existing frontend gates pass and CI workflow remains production-build oriented |
| Docs name `dev:local` and state it uses mock local data | Phase 4 | Notio frontend docs include the exact command and mock-data warning |

## Phase Closeout Protocol

After each phase:

1. Self-review changed files against ADR-008 and the scope guardrails.
2. Run the targeted verification listed in the phase.
3. Run the full frontend gates for the changed scope before committing:

```bash
./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test
./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build
```

4. Commit only files tied to the phase.
5. Stop and wait for review approval before starting the next phase.

## Phase 1: Explicit Runtime Selection and `dev:local`

**Objective:** Add the local runtime entry path without changing production behavior.

**Files:**

- Modify: `notio/frontend/package.json`
- Modify: `notio/frontend/src/main.ts`
- Create: `notio/frontend/src/local-browser-testing/createLocalRuntime.ts`
- Test: `notio/frontend/tests/local-browser-testing/RuntimeSelection.test.ts`

**Behavior to prove first:**

- Default runtime still requires production Supabase configuration and uses the Supabase-backed adapters.
- `VITE_NOTIO_RUNTIME=local` or an equivalent explicit local-only flag selects local composition.
- Missing Supabase env vars alone do not select local composition.
- `dev:local` launches Vite with the explicit local flag and does not require Supabase env vars.

- [x] Step 1: Write the failing runtime-selection tests.
- [x] Step 2: Run the targeted test and verify RED is an assertion failure, not a compilation error.
- [x] Step 3: Add the minimal explicit local-mode branch and `dev:local` npm script; do not change `package-lock.json` unless a dependency change is actually required.
- [x] Step 4: Run the targeted test and verify GREEN.
- [x] Step 5: Run full frontend gates.
- [x] Step 6: Commit with a short imperative message, for example `add notio local runtime selection`.

**Targeted verification:**

```bash
./scripts/run_silent.sh "notio local runtime selection tests" npm --prefix notio/frontend test -- tests/local-browser-testing/RuntimeSelection.test.ts
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY npm --prefix notio/frontend run dev:local -- --host 127.0.0.1
```

For the `dev:local` server check, stop the Vite process after confirming it starts and prints a localhost URL.

**Completion criteria:**

- `dev:local` exists.
- Local selection is explicit.
- Production selection remains the default.
- Production build env validation is still enforced for `vite build`.

## Phase 2: In-Memory Local Auth Adapter

**Objective:** Let the local browser-testing runtime enter authenticated UI without sending email or contacting Supabase.

**Files:**

- Create: `notio/frontend/src/local-browser-testing/InMemoryAuthSession.ts`
- Modify: `notio/frontend/src/local-browser-testing/createLocalRuntime.ts`
- Test: `notio/frontend/tests/local-browser-testing/InMemoryAuthSession.test.ts`
- Test: `notio/frontend/tests/local-browser-testing/LocalRuntimeApp.test.ts`

**Behavior to prove first:**

- Local auth starts in the state needed for deterministic local inspection.
- Calling `signIn(email)` transitions to authenticated state with the submitted email and never sends email.
- Calling `signOut()` transitions to unauthenticated state.
- Subscribers receive current and subsequent auth states.
- The local app shell can reach the authenticated browse path without Supabase.

- [ ] Step 1: Write the failing auth adapter tests.
- [ ] Step 2: Run the targeted tests and verify RED is an assertion failure.
- [ ] Step 3: Implement the minimal in-memory `AuthSession`.
- [ ] Step 4: Wire local auth into the local runtime.
- [ ] Step 5: Run targeted tests and verify GREEN.
- [ ] Step 6: Run full frontend gates.
- [ ] Step 7: Commit with a short imperative message, for example `add local in-memory auth`.

**Targeted verification:**

```bash
./scripts/run_silent.sh "notio local auth tests" npm --prefix notio/frontend test -- tests/local-browser-testing/InMemoryAuthSession.test.ts tests/local-browser-testing/LocalRuntimeApp.test.ts
```

**Completion criteria:**

- Local auth implements `AuthSession`.
- No Supabase SDK import appears in `notio/frontend/src/local-browser-testing/InMemoryAuthSession.ts`.
- Authenticated local UI path is observable in a test.

## Phase 3: Deterministic Local Browse Adapter and Scenarios

**Objective:** Expose ADR-008’s deterministic browse states through an in-memory `BrowseItemsReader`.

**Files:**

- Create: `notio/frontend/src/local-browser-testing/InMemoryBrowseItemsReader.ts`
- Create: `notio/frontend/src/local-browser-testing/localBrowseScenarios.ts`
- Modify: `notio/frontend/src/local-browser-testing/createLocalRuntime.ts`
- Test: `notio/frontend/tests/local-browser-testing/InMemoryBrowseItemsReader.test.ts`
- Test: `notio/frontend/tests/local-browser-testing/LocalBrowseScenarios.test.ts`

**Behavior to prove first:**

- The default local scenario renders a loaded page with deterministic items and a `nextCursor`.
- Refresh returns deterministic replacement data through `fetchFirstPage()`.
- Load more appends deterministic older items through `fetchAfter(cursor)`.
- Load-more exhausted returns `nextCursor: null`.
- Empty scenario returns `items: []` and `nextCursor: null`.
- Failure scenario throws `ReaderError` deterministically.
- Scenario selection is local-only and explicit, for example via a local query parameter or local env value consumed only by the local runtime.

- [ ] Step 1: Write the failing local browse adapter and scenario tests.
- [ ] Step 2: Run targeted tests and verify RED is an assertion failure.
- [ ] Step 3: Implement the minimal in-memory browse reader and scenario catalog.
- [ ] Step 4: Wire scenario selection into the local runtime.
- [ ] Step 5: Run targeted tests and verify GREEN.
- [ ] Step 6: Run full frontend gates.
- [ ] Step 7: Commit with a short imperative message, for example `add local browse scenarios`.

**Targeted verification:**

```bash
./scripts/run_silent.sh "notio local browse tests" npm --prefix notio/frontend test -- tests/local-browser-testing/InMemoryBrowseItemsReader.test.ts tests/local-browser-testing/LocalBrowseScenarios.test.ts
```

**Completion criteria:**

- All ADR-008 scenarios are covered by automated tests.
- Local fake browse data stays deterministic.
- Local browse adapter implements `BrowseItemsReader`.
- No Supabase SDK import appears in local browse files.

## Phase 4: Documentation, Import Gates, and Final Verification

**Objective:** Document the local workflow and prove ADR boundaries remain intact.

**Files:**

- Modify: `notio/README.md` or `notio/docs/tunnel.md` only if that is the existing best home for local run instructions
- Modify: `notio/docs/log.md`
- Modify: `.github/workflows/notio-frontend-core.yml` only if a missing gate must be added for ADR-008
- Test: existing frontend test suite

**Behavior to prove first:**

- Docs name `npm run dev:local` from `notio/frontend/`.
- Docs state local browser testing uses mock local data and does not validate Supabase RLS, magic-link delivery, or real database ordering.
- Local fake modules do not import Supabase.
- The frontend SDK import allowlist remains unchanged.
- CI/build gates still use the production build path.

- [ ] Step 1: Write or update tests/gates for local fake SDK-import isolation if no existing gate covers it.
- [ ] Step 2: Run the targeted gate and verify RED if the gate is new.
- [ ] Step 3: Add docs and the minimal gate implementation.
- [ ] Step 4: Run targeted gates and verify GREEN.
- [ ] Step 5: Run full frontend gates.
- [ ] Step 6: Update `notio/docs/log.md`.
- [ ] Step 7: Commit with a short imperative message, for example `document notio local browser testing`.

**Targeted verification:**

```bash
git grep -n "@supabase/supabase-js" -- notio/frontend/src
git grep -n "@supabase/supabase-js" -- notio/frontend/src/local-browser-testing
git grep -n "SERVICE_ROLE\\|service_role\\|VITE_SUPABASE_SERVICE" -- notio/frontend
./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test
./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build
```

Expected grep outcomes:

- SDK imports appear only in `notio/frontend/src/main.ts`, `notio/frontend/src/browse/SupabaseBrowseItemsReader.ts`, and `notio/frontend/src/auth/SupabaseAuthSession.ts`.
- SDK imports under `notio/frontend/src/local-browser-testing` return no matches.
- Service-role-style names under `notio/frontend` return no matches, except inside a CI negative-check command if that workflow deliberately contains the search pattern.

**Completion criteria:**

- ADR-008 docs are present.
- Import and secret boundaries are verified.
- Full frontend gates pass.
- `notio/docs/log.md` has a concise outcome-focused entry.

## Final Completion Criteria

- `npm --prefix notio/frontend run dev:local` starts a localhost Vite runtime without Supabase env vars.
- The production runtime remains the default and continues to use the Supabase-backed adapters.
- The local runtime uses only in-memory implementations for auth and browse.
- All ADR-008 deterministic scenarios are test-covered.
- Frontend unit tests, typecheck, and production build pass.
- No out-of-scope topology, deployment, Storybook, screenshot, or local Supabase changes were introduced.
- The plan status is updated, then this file is moved to `notio/docs/plans/implemented/notio-adr-008-local-browser-testing.md` after implementation.
