---
date: 2026-04-24
model: gpt-5
description: "Implementation plan for splitting Notio backend and frontend into symmetric folders and independent release units"
status: planned
type: plan
---

# Notio Release Split Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` if subagents are available, or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Notio into independently released backend and frontend products with symmetric folders, backend-owned Supabase schema/migrations, tag-driven deploys for both units, and frontend page versioning from frontend release metadata.

**Architecture:** `notio/backend/` becomes the Swift/Docker/Supabase backend root. `notio/frontend/` remains the Svelte/Vite/Cloudflare Pages frontend root. Release tooling must support unambiguous Notio-prefixed basenames for nested component roots before the physical move is applied.

**Tech Stack:** Swift 6.1, Hummingbird, Docker Compose, Supabase SQL migrations, TypeScript, Svelte, Vite, Vitest, Cloudflare Pages, GitHub Actions, repo release-unit scripts.

---

## Execution Lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-release-split`
- Expected branch: `codex/notio-release-split`
- Preflight check: [x] done

## Governing ADR Set

- `notio/docs/adr/adr-007-frontend-backend-release-split.md`
- `docs/adr/release/ADR-002-canonical-version-metadata.md`
- `docs/adr/release/ADR-003-tagging-convention.md`
- `docs/adr/release/ADR-005-release-unit-discovery.md`
- `docs/adr/release/ADR-006-docker-image-tagging-policy.md`
- `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md`

## Scope Guardrails

- Do not change backend capture behavior.
- Do not change frontend browse/auth behavior except adding visible frontend version display.
- Do not change Supabase schema content while moving migrations under backend ownership.
- Do not introduce a BFF, frontend server runtime, Pages Functions, or backend API for the frontend.
- Do not deploy, tag, push, or publish during this implementation plan.
- Do not use Git SHAs in the visible frontend version.
- Keep every phase commit-scoped and CI-passable before moving to the next phase.

## ADR Traceability Matrix

| ADR invariant | Plan phase |
|---|---|
| Backend and frontend release units are distinct | Phase 1, Phase 3 |
| `notio/backend/` is backend root | Phase 2 |
| `notio/frontend/` is frontend root | Phase 2 |
| Supabase schema and migrations live under backend | Phase 2 |
| Backend release unit is Docker-producing | Phase 3 |
| Frontend release unit is non-Docker | Phase 3 |
| Tags are distinct and map to own metadata | Phase 1, Phase 3 |
| Frontend visible version comes from frontend metadata | Phase 4 |
| Frontend visible version excludes Git SHA | Phase 4 |
| Frontend schema/read-contract dependencies name a minimum backend tag | Phase 5 |
| Frontend release PR checklist asks for minimum backend release | Phase 5 |
| Release manifest tests cover configured basename tag detection | Phase 1 |
| Docs name component ownership explicitly | Phase 5 |

## Phase 1: Support Explicit Release Basenames for Nested Units

### Objective

Make release tooling capable of representing nested Notio units as `notio-backend` and `notio-frontend` without forcing folder names like `notio/notio-backend`.

### Files

- Modify: `docs/adr/release/ADR-003-tagging-convention.md`
- Modify: `docs/adr/release/ADR-005-release-unit-discovery.md`
- Modify: `release-units.config.toml`
- Modify: `scripts/release/lib/manifest.js`
- Modify: `scripts/release/generate-manifest.js`
- Modify: `scripts/release/validate-manifest.js`
- Modify: `scripts/release/detect-releases.js` only if configured-basename tag detection tests reveal path-leaf coupling.
- Modify: `scripts/release/tests/generate-manifest.test.js`
- Modify: `scripts/release/tests/validate-manifest.test.js`
- Modify: `scripts/release/tests/detect-releases.test.js`
- Modify other release tests only when they assert the old leaf-name-only invariant.

### Required Behavior

- Release config supports explicit basenames for configured paths.
- Existing string-style path entries continue to work.
- Explicit basenames are required for nested component paths whose leaf name would be ambiguous, such as `notio/backend`.
- Basenames remain globally unique and still must not contain underscores.
- Manifest validation accepts either the legacy leaf-derived basename or an explicit config-declared basename.
- CI fails when a manifest basename is neither leaf-derived nor declared in config.

### Acceptance Criteria

- Release tests cover explicit basename discovery for `notio/backend` -> `notio-backend`.
- Release tests cover explicit basename discovery for `notio/frontend` -> `notio-frontend`.
- Release validation fails for an undeclared basename override.
- Release tests cover tag detection using configured basename rather than path leaf.
- Existing release units such as `nomos` remain unchanged in the generated manifest.

### Dependencies

- Current repo release ADR-003 and ADR-005 amendments are accepted.
- Existing release unit tests are the safety net for legacy unit behavior.

### Risks

- Relaxing the old leaf-name-only invariant could accidentally allow ambiguous basenames.
- Tag detection may keep using path leaf names even after manifest generation accepts configured basenames.

### Completion Signal

- `release-units.config.toml` can express `notio/backend` as `notio-backend` and `notio/frontend` as `notio-frontend`, while legacy string entries still generate the same manifest entries.

### Verification

- `./scripts/run_silent.sh "release-tests" node --test scripts/release/tests/*.test.js`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`

### Commit

- Commit message: `support explicit release unit basenames`

- [x] Release config schema supports explicit basenames
- [x] Release ADRs updated for explicit basename rule
- [x] Release tests prove new and legacy behavior
- [x] Verification passed
- [x] Commit created

## Phase 2: Move Backend Files Under `notio/backend/`

### Objective

Fix Notio folder asymmetry without changing backend runtime behavior.

### Files

- Move: `notio/release.toml` -> `notio/backend/release.toml`
- Move: `notio/Package.swift` -> `notio/backend/Package.swift`
- Move: `notio/Package.resolved` -> `notio/backend/Package.resolved`
- Move: `notio/Dockerfile` -> `notio/backend/Dockerfile`
- Move: `notio/docker-compose.yml` -> `notio/backend/docker-compose.yml`
- Move: `notio/.dockerignore` -> `notio/backend/.dockerignore`
- Move: `notio/.env.example` -> `notio/backend/.env.example`
- Move: `notio/Sources/` -> `notio/backend/Sources/`
- Move: `notio/Tests/` -> `notio/backend/Tests/`
- Move: `notio/scripts/` -> `notio/backend/scripts/`
- Move: `notio/supabase/` -> `notio/backend/supabase/`
- Modify: `notio/README.md`
- Modify: `notio/docs/gotchas.md`
- Modify: backend path references in `notio/docs/adr/*.md`, `notio/docs/specs/*.md`, and implemented plans only where paths would become stale.
- Modify: `notio/docs/log.md`

### Required Behavior

- Backend Swift package builds and tests from `notio/backend`.
- Docker build context remains complete, including `Tests/`.
- Supabase migrations are backend-owned by path.
- Product docs still live under `notio/docs/`.
- No backend source behavior changes are introduced.

### Acceptance Criteria

- `swift test` passes from `notio/backend`.
- `swift build` passes from `notio/backend`.
- `docker build` passes from `notio/backend`.
- No tracked backend source/test/deploy file remains directly under `notio/` except product-level `README.md`, `docs/`, `frontend/`, `research/` if retained, and component roots.

### Dependencies

- Phase 1 is complete so release metadata can move under `notio/backend/` without losing the required `notio-backend` basename.

### Risks

- SwiftPM and Docker build contexts can silently lose files during the move, especially the `Tests/` directory required by the current Docker build.
- Historical docs may intentionally mention old paths, so cleanup must distinguish migration history from stale operator instructions.

### Completion Signal

- Backend commands run from `notio/backend/`, and no current backend source, test, deploy, Docker, release metadata, or Supabase migration file remains directly under `notio/`.

### Verification

- `swift test` from `notio/backend`
- `swift build` from `notio/backend`
- `docker build -t notio-backend:local notio/backend`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

### Commit

- Commit message: `move notio backend under component root`

- [x] Backend files moved under `notio/backend/`
- [x] Supabase migrations moved under `notio/backend/supabase/`
- [x] Backend docs path references updated
- [x] Backend build/test/Docker verification passed
- [x] Commit created

## Phase 3: Split Release Units and CI/CD Workflows

### Objective

Make backend and frontend independently released and deployed through release-unit tags.

### Files

- Modify: `release-units.config.toml`
- Regenerate: `release-units.toml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/notio-core.yml`
- Modify: `.github/workflows/notio-frontend-core.yml`
- Modify: `.github/workflows/notio-frontend-deploy.yml`
- Modify: `.github/workflows/release-unit.yml`
- Modify: `notio/backend/scripts/deploy.sh`
- Modify: `notio/backend/docker-compose.yml`
- Modify: `notio/backend/docs/log.md` only if Phase 2 creates component logs; otherwise keep `notio/docs/log.md`.
- Modify: `notio/docs/todo/backend-deploy.md`
- Modify: release docs that list active units or tag examples.

### Required Behavior

- Manifest contains `notio-backend` with path `notio/backend`, metadata `release.toml`, and `docker = true`.
- Manifest contains `notio-frontend` with path `notio/frontend`, metadata `package.json`, and `docker = false`.
- `notio-backend_v<version>` tags run backend Swift tests and deploy the VPS Docker service.
- `notio-frontend_v<version>` tags run frontend typecheck/tests/build and deploy Cloudflare Pages.
- Trunk push Pages deployment is removed or converted into a reusable workflow called only by release-unit deployment.
- CI path filters dispatch backend checks for `notio/backend/**` and frontend checks for `notio/frontend/**`.
- Backend deploy scripts use backend paths and still preserve the SwiftPM `Tests/` build-context requirement.

### Acceptance Criteria

- Release validation proves both Notio units are registered.
- A dry-run or static test proves `notio-backend_v*` reaches backend release jobs only.
- A dry-run or static test proves `notio-frontend_v*` reaches frontend release jobs only.
- Frontend deploy workflow cannot run without the frontend core gate.
- Backend deploy workflow cannot run without backend Swift tests.
- `github-release.needs` includes every Notio backend/frontend test and deploy job added by this phase.
- The `github-release` success condition requires every Notio backend/frontend release job to be successful or intentionally skipped.
- `notify.needs`, failure conditions, and notification `job_results` include every Notio backend/frontend test and deploy job added by this phase.
- A static workflow check proves release fan-in cannot omit a split Notio release job from GitHub Release creation or failure notification.

### Dependencies

- Phase 1 is complete so `verify-tag.js`, manifest validation, tag detection, and release job conditionals can rely on configured basenames.
- Phase 2 is complete so backend CI and deploy jobs can use `notio/backend/` paths.

### Risks

- The release workflow has static job fan-in; adding split jobs without updating `github-release` or `notify` could hide failed deploys.
- Trunk-push frontend deployment may remain active and bypass release-unit tags unless it is removed or converted to a reusable release-only workflow.
- Backend and frontend tag conditionals can overlap or fall through to the generic Node `core` job if basename checks are incomplete.

### Completion Signal

- The release workflow has distinct backend and frontend release paths, and every terminal release/reporting job waits on and reports all split Notio jobs.

### Verification

- `node scripts/release/generate-manifest.js --check`
- `node scripts/release/validate-manifest.js`
- `./scripts/run_silent.sh "release-tests" node --test scripts/release/tests/*.test.js`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `VITE_SUPABASE_ANON_KEY=test-anon-key VITE_SUPABASE_URL=https://example.supabase.co ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
- Static workflow check for `github-release.needs`, `github-release` success conditions, `notify.needs`, notify failure conditions, and notify `job_results`.
- `swift test` from `notio/backend`

### Commit

- Commit message: `split notio release units`

- [ ] Manifest contains `notio-backend`
- [ ] Manifest contains `notio-frontend`
- [ ] CI filters use component roots
- [ ] Release workflow deploys backend and frontend from distinct tags
- [ ] Verification passed
- [ ] Commit created

## Phase 4: Display Frontend Version from Frontend Metadata

### Objective

Expose the frontend release version on the page without showing a Git SHA.

### Files

- Modify: `notio/frontend/package.json`
- Modify: `notio/frontend/package-lock.json`
- Modify: `notio/frontend/vite.config.ts`
- Modify: `notio/frontend/src/vite-env.d.ts`
- Create: `notio/frontend/src/version.ts`
- Modify: `notio/frontend/src/app.svelte`
- Modify: frontend tests under `notio/frontend/tests/`
- Modify: `notio/docs/log.md`

### Required Behavior

- Frontend package version is the frontend release metadata source.
- Vite injects the frontend package version at build time.
- The rendered page shows `v<frontend-version>` in low-emphasis UI.
- The rendered page does not show any Git SHA or commit identifier.
- Tests fail if the app stops rendering the frontend version.

### Acceptance Criteria

- Frontend test reads `notio/frontend/package.json` and proves the rendered version matches it.
- No frontend version code reads backend `release.toml`.
- No frontend UI displays a Git SHA.

### Dependencies

- Phase 3 is complete so `notio/frontend/package.json` is the frontend release unit metadata source.

### Risks

- Build-time version injection can accidentally read backend release metadata or Git state instead of frontend package metadata.
- Tests may assert only the version module and miss whether the app actually renders the visible version.

### Completion Signal

- The built frontend renders `v<package.json version>` and no frontend version path depends on backend `release.toml` or a Git SHA.

### Verification

- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `VITE_SUPABASE_ANON_KEY=test-anon-key VITE_SUPABASE_URL=https://example.supabase.co ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`

### Commit

- Commit message: `show notio frontend version`

- [ ] Frontend version module added
- [ ] UI renders package version
- [ ] Tests prove version display
- [ ] Verification passed
- [ ] Commit created

## Phase 5: Final Documentation and Cross-Reference Cleanup

### Objective

Remove stale one-unit Notio wording and make component ownership explicit across docs.

### Files

- Modify: `README.md`
- Modify: `notio/README.md`
- Modify: `notio/docs/log.md`
- Modify: `notio/docs/gotchas.md`
- Modify: `notio/docs/tunnel.md`
- Modify: `notio/docs/todo/backend-deploy.md`
- Modify or create the frontend release PR checklist location used by the repo process; if no shared PR template exists, document the checklist item in Notio release docs.
- Modify: Notio ADR/spec/plan links that still point at old backend paths.
- Modify: `.github/workflows/README.md` if workflow inventory needs the new Notio deploy split.

### Required Behavior

- Repo README component table distinguishes Notio backend and frontend where appropriate.
- Notio README describes the product family and both component roots.
- Backend-owned Supabase migrations are documented under backend.
- Frontend deploy docs describe Cloudflare Pages release deployment.
- No docs instruct operators to run backend commands from the old `notio/` root.
- Frontend release docs and PR checklist require naming the minimum compatible `notio-backend_v<version>` tag when a frontend change depends on a backend schema/read-contract change.

### Acceptance Criteria

- `rg "notio/(Package|Sources|Tests|Dockerfile|docker-compose|scripts|supabase|release.toml)"` returns only intentionally historical references or no matches.
- `rg "notio_v" notio docs .github release-units* scripts` returns only intentionally historical references or migration notes.
- `rg "notio-backend_v|notio-frontend_v" notio docs .github release-units* scripts` shows the new release vocabulary where deploy/release docs need it.
- Docs or PR checklist text includes the minimum-compatible-backend-tag question required by ADR-007.

### Dependencies

- Phases 1 through 4 are complete so documentation can describe the final paths, tag names, workflow shape, and visible frontend version source.

### Risks

- Historical `notio_v<version>` references can be deleted when they should remain as release history.
- Operator docs can keep stale `notio/` backend-root commands even after the component move.
- Compatibility guidance can drift from ADR-007 if frontend release docs omit the minimum backend tag question.

### Completion Signal

- Product and operator docs consistently describe `notio/backend/` and `notio/frontend/` as component roots, use split release tag vocabulary for new releases, and preserve old `notio_v<version>` only as historical context.

### Verification

- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`
- `swift test` from `notio/backend`
- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`

### Commit

- Commit message: `document notio component release split`

- [ ] Product docs updated
- [ ] Workflow docs updated if needed
- [ ] Stale old-root backend path references removed or justified
- [ ] Verification passed
- [ ] Commit created

## Completion Definition

- `release-units.toml` lists `notio-backend` and `notio-frontend` as distinct units.
- Backend source, tests, deploy scripts, Docker files, release metadata, and Supabase migrations live under `notio/backend/`.
- Frontend remains under `notio/frontend/` and displays its own release version from `package.json`.
- `notio-backend_v<version>` deploys only the backend.
- `notio-frontend_v<version>` deploys only the frontend.
- Full root build and test gates pass.
- Backend Swift build/test and Docker build pass from the new backend root.
- Frontend typecheck/tests/build pass from the frontend root.
- Documentation no longer treats `notio/` as the backend root.
