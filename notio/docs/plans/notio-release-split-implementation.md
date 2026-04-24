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
- Preflight check: [ ] done

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
- Modify: `scripts/release/tests/generate-manifest.test.js`
- Modify: `scripts/release/tests/validate-manifest.test.js`
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
- Existing release units such as `nomos` remain unchanged in the generated manifest.

### Verification

- `./scripts/run_silent.sh "release-tests" node --test scripts/release/tests/*.test.js`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`

### Commit

- Commit message: `support explicit release unit basenames`

- [ ] Release config schema supports explicit basenames
- [ ] Release ADRs updated for explicit basename rule
- [ ] Release tests prove new and legacy behavior
- [ ] Verification passed
- [ ] Commit created

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

### Verification

- `swift test` from `notio/backend`
- `swift build` from `notio/backend`
- `docker build -t notio-backend:local notio/backend`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

### Commit

- Commit message: `move notio backend under component root`

- [ ] Backend files moved under `notio/backend/`
- [ ] Supabase migrations moved under `notio/backend/supabase/`
- [ ] Backend docs path references updated
- [ ] Backend build/test/Docker verification passed
- [ ] Commit created

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
- Modify: `notio/docs/backend-deploy-todo.md`
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

### Verification

- `node scripts/release/generate-manifest.js --check`
- `node scripts/release/validate-manifest.js`
- `./scripts/run_silent.sh "release-tests" node --test scripts/release/tests/*.test.js`
- `./scripts/run_silent.sh "tests" npm test`
- `npm run typecheck --prefix notio/frontend`
- `npm test --prefix notio/frontend`
- `VITE_SUPABASE_ANON_KEY=test-anon-key VITE_SUPABASE_URL=https://example.supabase.co npm run build --prefix notio/frontend`
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

### Verification

- `npm run typecheck --prefix notio/frontend`
- `npm test --prefix notio/frontend`
- `VITE_SUPABASE_ANON_KEY=test-anon-key VITE_SUPABASE_URL=https://example.supabase.co npm run build --prefix notio/frontend`

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
- Modify: `notio/docs/backend-deploy-todo.md`
- Modify: Notio ADR/spec/plan links that still point at old backend paths.
- Modify: `.github/workflows/README.md` if workflow inventory needs the new Notio deploy split.

### Required Behavior

- Repo README component table distinguishes Notio backend and frontend where appropriate.
- Notio README describes the product family and both component roots.
- Backend-owned Supabase migrations are documented under backend.
- Frontend deploy docs describe Cloudflare Pages release deployment.
- No docs instruct operators to run backend commands from the old `notio/` root.

### Acceptance Criteria

- `rg "notio/(Package|Sources|Tests|Dockerfile|docker-compose|scripts|supabase|release.toml)"` returns only intentionally historical references or no matches.
- `rg "notio_v" notio docs .github release-units* scripts` returns only intentionally historical references or migration notes.
- `rg "notio-backend_v|notio-frontend_v" notio docs .github release-units* scripts` shows the new release vocabulary where deploy/release docs need it.

### Verification

- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`
- `swift test` from `notio/backend`
- `npm test --prefix notio/frontend`

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
