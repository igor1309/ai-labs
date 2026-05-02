---
date: 2026-05-02
model: gpt-5
description: "Implementation plan for replacing Clipdeck's shared-secret auth with Cloudflare Access single-owner authentication"
---

# Clipdeck Cloudflare Access Authentication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clipdeck's app-level shared-secret gate with Cloudflare Access single-owner authentication while preserving Worker-only GitHub access.

**Architecture:** Cloudflare Access becomes the production user-facing authentication boundary for `clipdeck.enoa.ai`. The Worker no longer validates `SHARED_SECRET`; it serves `/api/items` after Access has admitted the request and continues to use `GITHUB_TOKEN` for private GitHub reads. CI/deploy verification changes from checking a Worker-generated `401` to checking that unauthenticated production traffic is intercepted by Cloudflare Access.

**Tech Stack:** TypeScript Cloudflare Worker, Workers Static Assets, Wrangler, Vitest Workers pool, jsdom frontend tests, GitHub Actions, Cloudflare Access.

---

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: reuse existing
- Expected worktree: `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/clipdeck-access-adr`
- Expected branch: `codex/clipdeck-access-adr`
- Push policy: push after task
- Push boundary: keep Phase 1 through Phase 3 commits local; push only when Phase 4 reaches the PR/release task, then push the Phase 5 closeout branch after production cleanup is verified.
- Final archive behavior: after implementation, move this plan to `clipdeck/docs/plans/implemented/` in the Phase 5 closeout branch.
- Preflight check: [x] done

Stop immediately if:

- The active worktree is not the expected worktree/branch.
- Cloudflare Access tooling/API access is unavailable for the provisioning phase.
- A phase verification gate fails after two focused fix attempts.
- A required Cloudflare change would broaden access beyond the single owner identity.
- Phase 4 reaches PR/release work before Phases 1 through 3 have passed and been committed locally.
- The user changes scope or asks to pause.

## Governing Documents

- ADR: `clipdeck/docs/adr/adr-005-cloudflare-access-authentication.md`
- Spec: `clipdeck/docs/specs/cloudflare-access-authentication.md`
- Existing API/frontend spec: `clipdeck/docs/specs/spec-iphone-copy-library.md`
- Existing deployment ADR: `clipdeck/docs/adr/adr-004-ci-cd-workflows.md`

## ADR Traceability Matrix

| ADR-005 invariant | Plan phase(s) | Acceptance evidence |
| --- | --- | --- |
| Production Clipdeck is protected by Cloudflare Access on `clipdeck.enoa.ai` | Phase 3, Phase 5 | Unauthenticated production checks return Access-handled responses for `/` and `/api/items` |
| Access covers the whole hostname, including static assets and `/api/items` | Phase 3, Phase 5 | Production smoke proves both `/` and `/api/items` are blocked before app content/item data |
| Access policy allows only the owner's primary Cloudflare Access identity and denies all others | Phase 3 | Cloudflare Access policy inspection/provisioning evidence; no concrete identity committed |
| Concrete email/identity selector is not stored in source | Phase 2, Phase 5 | Source scan fails if the concrete owner identity appears under Clipdeck docs/source/test/config |
| Browser never receives GitHub PAT, raw GitHub responses, front matter, or out-of-allowlist data | Phase 1, Phase 5 | Existing item API tests remain green; no new client credential path is introduced |
| Worker remains the only runtime component with `GITHUB_TOKEN` | Phase 1, Phase 2 | Worker tests continue to use `GITHUB_TOKEN`; deploy checks do not use it |
| Worker may remove app-level shared-secret check after Access is active | Phase 1, Phase 3 | API accepts requests without Clipdeck `Authorization` locally; production Access is provisioned before release |
| CI does not authenticate as owner or use Access cookies, PINs, `GITHUB_TOKEN`, or `SHARED_SECRET` | Phase 2 | Workflow tests/static checks cover forbidden secrets and owner-auth artifacts |
| `SHARED_SECRET` is removed after production Access is verified, unless rollback is documented | Phase 4, Phase 5 | Operator runbook documents final cleanup; production smoke after secret removal returns `200` for authenticated owner |

## File Map

- `clipdeck/src/api/auth.ts` — remove app-level shared-secret auth type/logic or reduce it to `Env` without `SHARED_SECRET`.
- `clipdeck/src/api/items.ts` — remove `isAuthorized` check and `unauthorized` dependency from `/api/items`.
- `clipdeck/src/api/response.ts` — keep `json`; remove `unauthorized` only if no other code uses it.
- `clipdeck/src/index.ts` — should continue routing `/api/items` and Static Assets unchanged.
- `clipdeck/src/static/index.html` — remove unlock form/secret input from the production UI.
- `clipdeck/src/static/app.js` — load items directly, remove localStorage secret handling and Authorization header.
- `clipdeck/src/static/app.css` — remove or repurpose unlock-card-only CSS only when no longer referenced.
- `clipdeck/test/items.test.ts` — update API auth tests so `/api/items` no longer requires `SHARED_SECRET`.
- `clipdeck/test/index.test.ts` — update test environment shape after `SHARED_SECRET` removal.
- `clipdeck/test/frontend.test.ts` — update frontend tests for direct Access-authenticated load, no unlock form, no `clipdeck.secret`, no Authorization header.
- `.github/workflows/clipdeck-deploy.yml` — replace Worker `401` verification with Access-handled unauthenticated lock verification.
- `scripts/tests/clipdeck-deploy-workflow.test.js` — workflow invariant tests for unauthenticated Access-lock verification.
- `clipdeck/docs/operations/first-deploy.md` — supersede shared-secret setup instructions with Cloudflare Access setup and `SHARED_SECRET` cleanup/rollback guidance.
- `clipdeck/docs/log.md` — add one outcome-focused entry per meaningful change set.
- `clipdeck/docs/specs/cloudflare-access-authentication.md` — move to `implemented/` only in final closeout after all tests/spec criteria pass.
- `clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md` — this plan; update checkboxes as phases complete, then move to `implemented/`.

## Scope Guardrails

- Do not add multi-user support, roles, groups, service tokens, passkeys, in-app OAuth, or session storage.
- Do not change prompt/skill discovery, front matter stripping, item ordering, copy behavior, or GitHub PAT lifecycle except where tests need auth setup updates.
- Do not commit the concrete owner email address or identity selector.
- Do not give CI an owner session, one-time PIN, Access cookie, `GITHUB_TOKEN`, or `SHARED_SECRET`.
- Do not manually deploy production code outside the tag-driven release pipeline.

---

## Chunk 1: Local Worker and Frontend Contract

### Phase 1: Remove App-Level Shared Secret From Code

**Files:**

- Modify: `clipdeck/src/api/auth.ts`
- Modify: `clipdeck/src/api/items.ts`
- Modify: `clipdeck/src/api/response.ts`
- Modify: `clipdeck/src/static/index.html`
- Modify: `clipdeck/src/static/app.js`
- Modify: `clipdeck/src/static/app.css`
- Modify: `clipdeck/test/items.test.ts`
- Modify: `clipdeck/test/index.test.ts`
- Modify: `clipdeck/test/frontend.test.ts`
- Modify: `clipdeck/docs/log.md`

**Acceptance criteria:**

- `/api/items` no longer requires or validates a Clipdeck shared secret in local Worker tests.
- The `Env` type no longer requires `SHARED_SECRET`.
- Frontend tests prove the page fetches `/api/items` on load without an `Authorization` header.
- Frontend tests prove there is no unlock form, no secret input, and no `clipdeck.secret` localStorage access.
- Existing prompt/skill response, copy, reload, loading, toast, and resource-backed skill behavior remains covered.
- `npm test --workspace clipdeck` and `npm run typecheck --workspace clipdeck` pass.

- [x] **Step 1: Write failing Worker auth tests**

  Update `clipdeck/test/items.test.ts`:

  - Replace `should return unauthorized without shared secret` with a test that calls `/api/items` without `Authorization` and expects the normal empty sections response when GitHub returns empty source lists.
  - Replace `should return prompts and skills sections with correct shared secret` with a test that proves the same response works without any Clipdeck auth header.
  - Remove `SHARED_SECRET` from `makeEnv()`.

  Run: `npm test --workspace clipdeck -- test/items.test.ts`

  Expected before implementation: tests fail because the Worker still returns `401`.

- [x] **Step 2: Remove Worker shared-secret check**

  Update `clipdeck/src/api/items.ts`:

  - Remove the `isAuthorized` check.
  - Remove the `unauthorized` import.

  Update `clipdeck/src/api/auth.ts`:

  - Remove `SHARED_SECRET` from `Env`.
  - Remove `isAuthorized`.

  Update `clipdeck/src/api/response.ts`:

  - Remove `unauthorized()` if unused.

  Run: `npm test --workspace clipdeck -- test/items.test.ts` and `npm run typecheck --workspace clipdeck`.

  Expected after implementation: Worker auth tests pass; typecheck passes.

- [x] **Step 3: Write failing frontend Access-authenticated load tests**

  Update `clipdeck/test/frontend.test.ts` to reflect the final UI contract:

  - On import, the app fetches `/api/items` once.
  - The fetch call has no `Authorization` header.
  - No `[data-unlock-form]` or `[data-secret-input]` exists in the loaded HTML.
  - The app does not read, write, or remove `localStorage["clipdeck.secret"]`.
  - Reload refetches without requiring a stored secret.

  Run: `npm test --workspace clipdeck -- test/frontend.test.ts`.

  Expected before implementation: tests fail because the current frontend waits for a secret/unlock flow.

- [x] **Step 4: Remove frontend unlock flow**

  Update `clipdeck/src/static/index.html`:

  - Remove the unlock form and secret input.
  - Keep loading state, library section, reload button, sections container, toast region.

  Update `clipdeck/src/static/app.js`:

  - Call `loadItems()` on module load.
  - Remove `localStorage.getItem/setItem/removeItem("clipdeck.secret")`.
  - Remove unlock form submit and mousemove handlers.
  - Fetch `/api/items` without `Authorization`.
  - On non-OK response, show a toast and keep the existing app shell state appropriate for retry.
  - Reload always refetches.

  Update `clipdeck/src/static/app.css`:

  - Remove unlock-card-only styles if no remaining markup uses them.
  - Keep visual polish for loading, toolbar, item list, toast, and resource-backed skills.

  Run: `npm test --workspace clipdeck -- test/frontend.test.ts`.

  Expected after implementation: frontend tests pass.

- [x] **Step 5: Run phase gate**

  Run:

  - `npm test --workspace clipdeck`
  - `npm run typecheck --workspace clipdeck`
  - `git diff --check`

  Expected: all pass.

- [x] **Step 6: Update log and commit Phase 1**

  Add a concise 2026-05-02 entry to `clipdeck/docs/log.md` describing removal of app-level shared-secret auth in favor of Access.

  Gate status before commit:

  - Preflight: passed
  - Scope verification: passed
  - Step closeout: passed
  - Plan tracker update: passed

  Commit:

  ```bash
  git add clipdeck/src/api/auth.ts clipdeck/src/api/items.ts clipdeck/src/api/response.ts clipdeck/src/static/index.html clipdeck/src/static/app.js clipdeck/src/static/app.css clipdeck/test/items.test.ts clipdeck/test/index.test.ts clipdeck/test/frontend.test.ts clipdeck/docs/log.md clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md
  git commit -m "remove clipdeck shared secret auth"
  ```

---

## Chunk 2: Deploy Verification and Operations

### Phase 2: Replace Deploy Check With Access Lock Verification

**Files:**

- Modify: `.github/workflows/clipdeck-deploy.yml`
- Create: `scripts/tests/clipdeck-deploy-workflow.test.js`
- Modify: `clipdeck/docs/operations/first-deploy.md`
- Modify: `clipdeck/docs/log.md`

**Acceptance criteria:**

- Deploy verification no longer expects a Worker-generated `401 {"error":"unauthorized"}`.
- Deploy verification accepts only spec-defined Access-handled unauthenticated responses.
- Deploy verification fails if `/api/items` returns a JSON object with `sections`.
- Deploy verification does not use owner credentials, Access cookies, one-time PINs, `GITHUB_TOKEN`, or `SHARED_SECRET`.
- The operator runbook describes Cloudflare Access setup, source-safe identity handling, and final `SHARED_SECRET` cleanup/rollback behavior.
- Root test/build gates pass because workflow/config behavior changed.

- [x] **Step 1: Write failing workflow validation**

  Add `scripts/tests/clipdeck-deploy-workflow.test.js` to inspect `.github/workflows/clipdeck-deploy.yml` and assert:

  - It does not require status exactly `401` for Clipdeck production verification.
  - It does not reference `SHARED_SECRET`, `GITHUB_TOKEN`, Access cookies, one-time PINs, or owner credentials in the verification step.
  - It checks for Access-handled unauthenticated responses and rejects item data.

  Run: `./scripts/run_silent.sh "tests" npm test`.

  Expected before implementation: test fails against the old `401` check.

- [x] **Step 2: Update deploy workflow**

  Update `.github/workflows/clipdeck-deploy.yml` verification so it:

  - Requests `${CLIPDECK_PRODUCTION_URL}/api/items` without credentials.
  - Captures status, headers, and body.
  - Passes for either:
    - HTTP `302`/`303` with a `Location` header that indicates Cloudflare Access authentication, or
    - HTTP `401`/`403` whose body is not `{"error":"unauthorized"}` and does not contain `"sections"`.
  - Fails for `200`, any body containing `"sections"`, or the exact old Worker unauthorized body.

  Do not add owner authentication or service-token auth.

  Run: `./scripts/run_silent.sh "tests" npm test`.

  Expected after implementation: workflow validation passes.

- [x] **Step 3: Update operator runbook**

  Update `clipdeck/docs/operations/first-deploy.md`:

  - Add Cloudflare Access application setup for `clipdeck.enoa.ai`.
  - State the concrete owner identity belongs in Cloudflare configuration or non-source-controlled operator notes only.
  - Remove `SHARED_SECRET` from normal runtime setup.
  - Document `GITHUB_TOKEN` remains required.
  - Document the temporary rollback-window rule if `SHARED_SECRET` is retained during migration.
  - Update smoke checks: unauthenticated requests are Access-blocked; authenticated owner browser loads the app and `/api/items`.

  Run `git diff --check` after the docs update.

- [x] **Step 4: Run phase gate**

  Run:

  - `./scripts/run_silent.sh "tests" npm test`
  - `./scripts/run_silent.sh "build" npx tsc --noEmit`
  - `git diff --check`

  Expected: all pass.

- [x] **Step 5: Update log and commit Phase 2**

  Add a concise `clipdeck/docs/log.md` entry for deploy verification/runbook updates.

  Gate status before commit:

  - Preflight: passed
  - Scope verification: passed
  - Step closeout: passed
  - Plan tracker update: passed

  Commit:

  ```bash
  git add .github/workflows/clipdeck-deploy.yml scripts/tests/clipdeck-deploy-workflow.test.js clipdeck/docs/operations/first-deploy.md clipdeck/docs/log.md clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md
  git commit -m "verify clipdeck access lock"
  ```

### Phase 3: Provision Cloudflare Access

**Files:**

- Modify: `clipdeck/docs/log.md`
- Optional modify: `clipdeck/docs/operations/first-deploy.md` only if provisioning reveals runbook corrections

**Acceptance criteria:**

- Cloudflare Access self-hosted application protects `clipdeck.enoa.ai/*`.
- Policy is single-owner and deny-by-default.
- The concrete identity is not committed to the repo.
- Unauthenticated production requests to `/` and `/api/items` produce spec-defined Access-handled responses before item data or app content.
- Phase completion depends on automated unauthenticated HTTP checks; authenticated browser validation is supplemental.
- The legacy Clipdeck unlock flow may still appear behind Access in this phase because the production Worker has not yet been released.
- No production code deploy occurs in this phase.

- [x] **Step 1: Inspect current Cloudflare state**

  Use available Cloudflare tooling or dashboard/API access to determine whether an Access application already exists for `clipdeck.enoa.ai`.

  Expected:

  - If it exists, it covers the full hostname and has a single-owner deny-by-default policy, or needs correction.
  - If it does not exist, create it per ADR-005/spec.

  Stop if Cloudflare access is unavailable.

- [x] **Step 2: Configure Access application**

  Configure a Cloudflare Access self-hosted application:

  - Application covers `clipdeck.enoa.ai/*`.
  - Policy allows only the owner's primary Cloudflare Access identity.
  - Policy denies all other identities.
  - Use email one-time PIN unless an existing Cloudflare-supported provider tied to the same owner identity is already preferred.

  Do not commit the concrete identity.

- [x] **Step 3: Verify unauthenticated production lock**

  Run unauthenticated checks from a clean client context:

  - `GET https://clipdeck.enoa.ai/`
  - `GET https://clipdeck.enoa.ai/api/items`

  Expected:

  - Both return spec-defined Access-handled responses.
  - `/` does not return the Clipdeck static page.
  - `/api/items` does not return a JSON object with `sections`.
  - `/api/items` does not return `{"error":"unauthorized"}`.
  - The checks are repeatable from a non-owner session without cookies, PINs, service tokens, or owner credentials.

- [ ] **Step 4: Verify authenticated owner path**

  Using an authenticated owner browser session:

  - Open `https://clipdeck.enoa.ai/`.
  - Confirm Cloudflare Access admits the owner.
  - If the old production Worker is still deployed, treat the legacy Clipdeck unlock form or Worker-level shared-secret `401` as an expected temporary migration state.
  - Do not require the no-unlock UI contract until Phase 4 has deployed the new Worker and Phase 5 runs final smoke checks.

- [x] **Step 5: Update log and commit Phase 3**

  Add a concise `clipdeck/docs/log.md` entry that Cloudflare Access was provisioned and unauthenticated production lock checks passed. Do not include the concrete identity.

  Run:

  - `git diff --check`
  - docs front matter/link checks if runbook changed

  Commit:

  ```bash
  git add clipdeck/docs/log.md clipdeck/docs/operations/first-deploy.md clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md
  git commit -m "record clipdeck access provisioning"
  ```

---

## Chunk 3: Release and Cleanup

### Phase 4: Version, Release, and Production Deploy

**Files:**

- Modify: `clipdeck/package.json`
- Modify: `package-lock.json`
- Modify: `release-units.toml`
- Modify: `clipdeck/docs/log.md`

**Acceptance criteria:**

- Clipdeck version is bumped for the auth-boundary change.
- Release manifest matches the new version.
- Full repo test/build gates pass before tagging.
- Release runs through `clipdeck_v<version>` tag on `trunk`.
- Release workflow deploys the Worker and passes the Access lock verification.
- After this phase, production is Access-protected and the deployed Worker no longer contains the Clipdeck shared-secret gate.

- [ ] **Step 1: Bump Clipdeck version**

  Choose the next patch version from `clipdeck/package.json` because this is a backward-compatible auth-boundary/deploy behavior change for a private tool.

  Update:

  - `clipdeck/package.json`
  - `package-lock.json`
  - `release-units.toml` via `node scripts/release/generate-manifest.js`

- [ ] **Step 2: Run release pre-push gates**

  Run:

  - `./scripts/run_silent.sh "tests" npm test`
  - `./scripts/run_silent.sh "build" npx tsc --noEmit`
  - `git diff --check`

  Expected: all pass.

- [ ] **Step 3: Commit Phase 4 code/release metadata**

  Add a concise `clipdeck/docs/log.md` entry for the versioned Access-auth release.

  Commit:

  ```bash
  git add clipdeck/package.json package-lock.json release-units.toml clipdeck/docs/log.md clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md
  git commit -m "release clipdeck access auth"
  ```

- [ ] **Step 4: Merge through PR**

  Push the branch and open a PR if not already open. Enable merge-commit auto-merge with branch deletion after CI is green, per repo policy.

  Use `./scripts/watch-pr.sh <pr>` to watch CI.

  Expected:

  - CI passes.
  - PR merges to `trunk`.

- [ ] **Step 5: Tag and watch release**

  From updated `trunk`, create and push only the explicit Clipdeck tag:

  - `clipdeck_v<version>`

  Watch `release-unit.yml` until completion.

  Expected:

  - Shared release core tests pass.
  - `deploy-clipdeck` runs and passes the Access lock check.
  - GitHub Release is created.

### Phase 5: Remove `SHARED_SECRET` and Close Out

**Files:**

- Move: `clipdeck/docs/specs/cloudflare-access-authentication.md` to `clipdeck/docs/specs/implemented/cloudflare-access-authentication.md`
- Move: `clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md` to `clipdeck/docs/plans/implemented/clipdeck-cloudflare-access-authentication.md`
- Modify: `clipdeck/docs/log.md`

**Acceptance criteria:**

- Production Worker no longer has `SHARED_SECRET`, unless a documented rollback window is intentionally active.
- Authenticated owner `/api/items` request still returns `200` after `SHARED_SECRET` removal.
- Unauthenticated `/` and `/api/items` remain Access-blocked.
- Spec moves to `implemented/` only after all tests pass.
- Plan moves to `implemented/` on a post-release closeout branch and branch is clean.

- [ ] **Step 0: Create closeout branch after release**

  After Phase 4 has merged and `clipdeck_v<version>` has deployed successfully, create a fresh closeout branch from updated `trunk` because the implementation branch is deleted by the merge policy:

  - Worktree: `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/clipdeck-access-auth-closeout`
  - Branch: `codex/clipdeck-access-auth-closeout`

  Run process preflight again and stop if the worktree/branch does not match.

- [ ] **Step 1: Remove production `SHARED_SECRET`**

  Use Cloudflare tooling/dashboard to delete the `SHARED_SECRET` Worker secret from production unless retaining a documented rollback window.

  Do not delete `GITHUB_TOKEN`.

- [ ] **Step 2: Run final production smoke**

  Verify:

  - Unauthenticated `/` is Access-blocked.
  - Unauthenticated `/api/items` is Access-blocked and does not return item data.
  - Authenticated owner `/` loads.
  - Authenticated owner `/api/items` returns `200`.
  - Prompt/skill rendering and copy feedback still work.

- [ ] **Step 3: Move spec and plan to implemented**

  Move:

  - `clipdeck/docs/specs/cloudflare-access-authentication.md` to `clipdeck/docs/specs/implemented/cloudflare-access-authentication.md`
  - `clipdeck/docs/plans/clipdeck-cloudflare-access-authentication.md` to `clipdeck/docs/plans/implemented/clipdeck-cloudflare-access-authentication.md`

- [ ] **Step 4: Final docs/log verification**

  Add final `clipdeck/docs/log.md` entry for Access auth completion and secret cleanup.

  Run:

  - `git diff --check`
  - markdown structure/front matter/link checks for moved files
  - `rg -n "igor1309@gmail\\.com" clipdeck/docs clipdeck/src clipdeck/test clipdeck/wrangler.toml` and expect no matches

- [ ] **Step 5: Commit closeout**

  Gate status before commit:

  - Preflight: passed
  - Scope verification: passed
  - Step closeout: passed
  - Plan tracker update: passed

  Commit:

  ```bash
  git add clipdeck/docs/log.md clipdeck/docs/specs/implemented/cloudflare-access-authentication.md clipdeck/docs/plans/implemented/clipdeck-cloudflare-access-authentication.md
  git commit -m "complete clipdeck access auth"
  ```

## Final Verification

Before declaring the plan complete:

- `./scripts/run_silent.sh "tests" npm test` passes.
- `./scripts/run_silent.sh "build" npx tsc --noEmit` passes.
- Production unauthenticated `/` and `/api/items` are Cloudflare Access-blocked.
- Production authenticated owner `/api/items` returns `200`.
- `SHARED_SECRET` is absent from the production Worker secret set or a rollback window is explicitly documented.
- `git status --short` is clean.
