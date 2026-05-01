---
title: "clipdeck MVP implementation plan"
date: 2026-05-01
model: claude-opus-4-7
description: "Phased implementation plan for clipdeck v0.1.0: TypeScript Cloudflare Worker serving the iPhone copy library backed by igor1309/ai-labs"
status: draft
---

# clipdeck MVP Implementation Plan

## Goal

Ship clipdeck v0.1.0: a single Cloudflare Worker that serves an iPhone-friendly webpage and `GET /api/items` per the spec, reading prompts and skills from `igor1309/ai-labs` (branch `trunk`).

Source documents (read these before executing):

- `clipdeck/docs/adr/adr-001-iphone-copy-library.md` — architecture and behavior invariants
- `clipdeck/docs/adr/adr-002-credential-lifecycle.md` — runtime GitHub PAT lifecycle
- `clipdeck/docs/adr/adr-003-deployment-topology.md` — Cloudflare Worker with Static Assets
- `clipdeck/docs/adr/adr-004-ci-cd-workflows.md` — PR gate and tag-driven deploy
- `clipdeck/docs/specs/spec-iphone-copy-library.md` — API contract and the 30 enumerated tests

## Tech stack decisions

These are implementation-level choices the ADRs deliberately left open. They are pinned here rather than in the ADRs because they don't carry architectural commitment; a future change can pick a different library without touching the ADR set.

- **Language / runtime.** TypeScript on Cloudflare Workers (Workers Runtime API).
- **Test framework.** Vitest with `@cloudflare/vitest-pool-workers` for unit and Worker-integration tests. JSDOM (or Vitest browser mode) for the frontend tests.
- **Frontend.** Vanilla TypeScript + HTML + CSS. No framework. The page is two lists with copy buttons; a framework adds more weight than value.
- **YAML / front-matter parser.** `gray-matter`. It's the de-facto Node/TS choice for the exact parse-and-strip semantics this spec requires (return `data` plus the original body byte range).
- **GitHub client.** Raw `fetch` against the GitHub REST API (Contents API for file listing/reads). No Octokit — its bundle weight isn't worth it for two endpoints.
- **Shared-secret transport.** HTTP `Authorization: Bearer <secret>` header on every API request. The frontend reads the secret from `localStorage`; if absent or rejected, it shows a one-field unlock form that stores the secret on a successful `200`.

## Project layout

```
clipdeck/
├── src/
│   ├── index.ts              # Worker entry: routing only
│   ├── api/
│   │   ├── auth.ts           # shared-secret check
│   │   ├── items.ts          # GET /api/items handler
│   │   ├── github.ts         # GitHub Contents API client
│   │   ├── frontmatter.ts    # gray-matter wrapper, exposes (body, title, subtitle)
│   │   ├── discovery.ts      # prompt + skill discovery and skillShape detection
│   │   └── response.ts       # success/error JSON shapes
│   └── static/
│       ├── index.html
│       ├── app.css
│       └── app.ts
├── test/
│   ├── frontmatter.test.ts
│   ├── discovery.test.ts
│   ├── items.test.ts         # /api/items integration with mocked GitHub
│   └── frontend.test.ts      # DOM tests for unlock + render + copy
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── wrangler.toml
```

## Plan declarations

Per repo `CLAUDE.md` "Process Gates":

- **Execution mode.** `auto-continue`. Phases run end-to-end; phase boundaries are commit + push points, not human-review gates.
- **Human review behavior.** Not gated. PR review at phase end is sufficient.
- **Worktree mode.** Standard. Each phase runs on a dedicated branch `clipdeck/<phase-slug>` in a worktree under `worktrees/clipdeck-<phase-slug>/`.
- **Push policy.** Push at the end of each phase as one PR, merged with `--merge --auto --delete-branch` per repo policy.
- **Final archive.** This file moves to `clipdeck/docs/plans/implemented/clipdeck-mvp.md` after Phase 4 ships and the first production deploy succeeds.

## Phase 0 — Scaffold

Goal: the project builds, types check, and tests run. No behavior yet.

Tasks:

- Create `clipdeck/package.json` (private workspace package, name `clipdeck`).
- Add `clipdeck` to the root `package.json` workspaces array.
- Create `clipdeck/tsconfig.json` (target `ES2022`, lib `ESNext`, types `@cloudflare/workers-types`).
- Create `clipdeck/wrangler.toml` (Worker name, compatibility date, Static Assets `assets` binding pointing at `src/static/`).
- Create `clipdeck/vitest.config.ts` with the Workers pool.
- Create `clipdeck/src/index.ts` returning a placeholder `200 OK` from the Worker.
- Create one trivial test that imports the Worker and asserts on the placeholder response.
- Add `clipdeck` to `scripts/loc-dashboard.sh` known list (already done) and confirm `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` pass at repo level.

Phase exit gate: typecheck + tests green.

## Phase 1 — Discovery and front-matter stripping (units)

Goal: the testable core is done in isolation, off the GitHub network.

Tasks:

- `frontmatter.ts`: a function `parse(raw: string): { body: string, title?: string, description?: string, summary?: string }` built on `gray-matter`. Behavior contract: covers the 4 well-formed/no-front-matter/malformed/empty-front-matter cases from the spec. Tests 9–12, 17, 29.
- `discovery.ts`: pure functions `discoverPrompts(files)` and `discoverSkills(folders)` that take normalized GitHub listings and produce `Item[]`. Tests 4, 5, 6, 7, 8, 25, 26, 27, 28.
- Title/subtitle derivation lives in `discovery.ts` (pure). Tests 13–17.
- Item ordering, section ordering, and empty-section emission live in a tiny `assemble.ts` (or in `items.ts`).

Phase exit gate: phase tests pass; spec tests 4–17 and 25–29 covered at the unit level.

## Phase 2 — API endpoint

Goal: `GET /api/items` works end-to-end against a mocked GitHub.

Tasks:

- `github.ts`: client with two methods, `listDir(path)` and `readFile(path)`, using the GitHub Contents API and `Authorization: Bearer ${env.GITHUB_TOKEN}`.
- `auth.ts`: middleware checking `Authorization: Bearer ${env.SHARED_SECRET}`. Returns `401 { error: "unauthorized" }` on failure.
- `items.ts`: orchestrates auth → discovery → assemble → response.
- `response.ts`: pins success and error JSON shapes per the spec.
- `index.ts`: routing — `/api/items` → `items.ts`; everything else → static asset.
- Tests in `items.test.ts` use a fetch stub for `github.ts`. Cover spec tests 1–3, 18, 19, 20, 30. Re-cover items 4–17 and 25–29 at the integration level via realistic GitHub fixture inputs.

Phase exit gate: spec tests 1–20, 25–30 pass against the Worker via Vitest's Workers pool.

## Phase 3 — Frontend

Goal: the iPhone page works against the running Worker.

Tasks:

- `index.html`: viewport meta for iPhone, single-column body with two section containers, an unlock dialog, and a copy-feedback toast region.
- `app.css`: iPhone-first; large tap targets; visual distinction for `resource-backed` skills (Test 24).
- `app.ts`:
  - On load, read `clipdeck.secret` from `localStorage`. If absent → show unlock form. If present → fetch `/api/items` with `Authorization: Bearer …`. On `401` → drop the stored secret and show the unlock form.
  - Render sections in order, items in order, with `resource-backed` styling distinction.
  - Tap an item → `navigator.clipboard.writeText(body)` → show "Copied" toast (success path) or "Copy failed" toast (failure path).
  - Reload button refetches.
  - Pull-to-refresh wired via touch handlers where supported.
- `frontend.test.ts`: DOM tests covering spec tests 21, 22, 23, 24.

Phase exit gate: spec tests 1–30 all green.

## Phase 4 — Release manifest, deploy, runbook

Goal: clipdeck is shipped to production from a tag.

Tasks:

- Add `clipdeck` to `release-units.config.toml` (basename `clipdeck`, root `clipdeck/`, deploy target Cloudflare Worker).
- Regenerate `release-units.toml`. Verify CI manifest-drift gate is green.
- Add `.github/workflows/clipdeck-core.yml` (typecheck + tests) and wire its path filter into `ci.yml`'s `changes` job. Path globs per ADR-004.
- Add `.github/workflows/clipdeck-deploy.yml` (reusable workflow) that runs `wrangler deploy` and then runs the post-deploy verification per ADR-004: an unauthenticated `GET /api/items` against the deployed Worker hostname that MUST return `401`. Failure notifications route through `notify-telegram-failure.yml`; no inline notifications.
- Edit `release-unit.yml` to dispatch to `clipdeck-deploy.yml` (matching the `notio-frontend-deploy.yml` precedent), and extend `github-release.needs`, `github-release.if`, `notify.needs`, and `notify.if` to include the clipdeck deploy job.
- Write the operator runbook at `clipdeck/docs/operations/first-deploy.md`:
  1. create Cloudflare account if needed; choose a Worker subdomain (`clipdeck.<account>.workers.dev`) or bind a custom domain
  2. issue Cloudflare API token per ADR-004 scoping (single account, `Workers Scripts: Edit` only)
  3. set `CLOUDFLARE_API_TOKEN` GitHub Actions secret
  4. issue GitHub fine-grained PAT per ADR-002 scoping
  5. cut tag `clipdeck_v0.1.0`; the release pipeline runs `wrangler deploy` and the unauthenticated `401` verification (the runtime PAT is not yet set; verification still passes because it's auth-only)
  6. set `wrangler secret put GITHUB_TOKEN` and `wrangler secret put SHARED_SECRET` against the now-deployed Worker
  7. open the Worker URL on iPhone, enter the shared secret, bookmark to home screen
- Tag `clipdeck_v0.1.0`. Confirm the deploy completes and the unauthenticated `401` check passes; then complete the operator runbook steps and confirm an authenticated `GET /api/items` returns `200` from the iPhone.

Phase exit gate: production Worker serves the iPhone page and returns sanitized items for `igor1309/ai-labs`.

## Out of scope for this plan

- staging tier, preview deployments
- structured logging / observability
- automated PAT rotation
- E2E tests against a live Cloudflare deployment
- iPhone PWA install manifest (the bookmark-to-home-screen path is sufficient for v0.1.0)

## Done criteria

- Phase 4 exit gate met.
- Spec at `clipdeck/docs/specs/spec-iphone-copy-library.md` moves to `clipdeck/docs/specs/implemented/`.
- This plan moves to `clipdeck/docs/plans/implemented/clipdeck-mvp.md`.
- `clipdeck/docs/log.md` records the v0.1.0 ship.
