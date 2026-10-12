---
date: 2026-04-24
model: claude-opus-4-6
description: "CI/CD architecture overview for the ai-labs monorepo"
---

# CI/CD Workflows

Workflows are organized into four categories:

- **Dispatcher** — `ci.yml` routes pushes and PRs to per-project workflows based on changed paths (`dorny/paths-filter`).
- **Per-Project Core** — reusable `workflow_call` workflows (`<project>-core.yml`) that each project owns independently.
- **Release** — tag-triggered pipelines for per-unit and legacy Oracle releases.
- **Scheduled & Independent** — health checks, dashboards, deployments, and housekeeping that run on cron or trunk push.

## Path Filtering Policy

`ci.yml` does **not** use top-level `paths-ignore`. All path filtering happens inside the workflow via `dorny/paths-filter` in the `changes` job, which gates per-project jobs with `if:` conditions.

This ensures the `report` job (a required status check for branch protection) always runs — even on doc-only or non-code changes — while expensive test/build jobs are skipped when their project files are unchanged.

The `report` job is named `report` only on `pull_request` runs (`report (push)` and `report (workflow_dispatch)` otherwise), so the required check is satisfied only by the PR's own run, never by the push run of the same commit.

Per-project workflows do not need their own path filters — the dispatcher's `changes` job already prevents them from running on unrelated changes.

Each project's filter in the `changes` job is an **allowlist of build/test inputs** — source, tests, manifests, lockfiles, and build/deploy descriptors (e.g. `Dockerfile`, `compose`, `Caddyfile`, `wrangler.*`). It deliberately **excludes documentation** (`<project>/docs/**`, `README.md`, `TODO.md`, landing/`*.html`, research notes) so a docs-only change skips the expensive core job while the required `report` check still runs. Do **not** use a blanket `<project>/**` glob: it pulls `docs/**` into the trigger set and runs the full core pipeline (tests, and for some projects a Docker build + container smoke) on documentation edits. When adding a project, list its code paths explicitly, as `clipdeck` and `agonara` do.

A document a project's tests read is a test input, not documentation, and its filter lists it. Agister's tests read its ADRs and diagrams (`agister/docs/**`), its skill, its `README.md`, `testdata/` and `scripts/`, and every `AGENTS.md` in the repository, so the `agister` filter lists each.

## What CI runs

Each test, what runs it, and the change that triggers it (LAB-167, LAB-220, LAB-219). `scripts/tests/ci-workflow-paths.test.js` keeps this true: every `scripts/tests/*.test.js` is run, every Go module is tested by the job its changes run, each kind of file Agister's tests read runs `agister-core`, the documents agonara's and noreta's tests read run their jobs, and the projects LAB-220 found unrun are each tested by the job their changes run.

| Tests | Run by | Triggered by | Status |
| --- | --- | --- | --- |
| Agister's Go tests (`agister/`), gofmt, vet, race | `agister-core`: `agister/scripts/test.sh` | the `agister` filter | runs |
| Agister Pages tests (`agister/pages/tests/*.test.js`) | `agister-core`: `agister/scripts/test.sh` | the `agister` filter | runs |
| gokit's Go tests (`gokit/`) | `agister-core`: `agister/scripts/test.sh` calls `gokit/scripts/test.sh` | `gokit/**` | runs |
| The gate's Go tests (`scripts/agister-gate/`) | `agister-core`, step Gate | `scripts/agister-gate/**` | runs |
| The example settings pass `agister check` | `agister-core` | the `agister` filter | runs |
| warder's Go tests (`warder/`), gofmt, vet, race | `warder-core`: `warder/scripts/test.sh` | the `warder` filter | runs |
| The repository scripts' tests (`scripts/tests/*.test.js`) | `repo-scripts` | every push and pull request | runs |
| The release scripts' tests (`scripts/release/tests/*.test.js`) | `release-validation` | the `release` filter | runs |
| The research scripts' Python tests (`research/agister/adversarial-cycle/scripts/tests/`) | nothing | — | excluded: research, not a product |
| nomos (`nomos/tests/*.test.js`), typecheck | `nomos-core` | the `nomos` filter | runs; the two E2E tests need `RUN_NOMOS_E2E`, which no workflow sets |
| oracle (`oracle/{packages,apps}/*/tests/*.test.js`), typecheck | `oracle-core` | the `oracle` filter | runs; the web E2E runs in `release.yml` and `web-e2e.yml` (manual) only |
| web-scout (`web-scout/tests/*.test.js`), typecheck | `web-scout-core` | the `web-scout` filter | runs |
| corpus-scout (`corpus-scout/tests/*.test.js`), typecheck | `corpus-scout-core` | the `corpus-scout` filter | runs |
| reinix (`reinix/tests/*.test.js`), typecheck | `reinix-core` | the `reinix` filter | runs |
| clipdeck (`clipdeck/test/*.test.ts`), typecheck | `clipdeck-core` | the `clipdeck` filter | runs |
| ntfy-sender (`ntfy-sender/tests/*.test.js`), in Chromium | `ntfy-sender-core` | the `ntfy-sender` filter | runs |
| noreta (`noreta/tests/*.test.ts`), typecheck | `noreta-core` | the `noreta` filter, with `noreta/docs/qa.md` | runs |
| agonara (`agonara/tests/*.test.js`), OpenAPI check and lint, Docker build | `agonara-core` | the `agonara` filter, with the documents, skills and root `docs/loc-dashboard.html` its tests read | runs |
| foliotell iOS (`foliotell/ios/Tests/`), build, archive | `foliotell-core` | the `foliotell` filter | runs |
| foliotell Android (`:core:test`), debug build | `foliotell-android-core` | the `foliotell-android` filter | runs |
| notio backend (`notio/backend/Tests/`) | `notio-core` | the `notio` filter | runs |
| notio frontend (`notio/frontend/tests/`), typecheck, build | `notio-frontend-core` | the `notio-frontend` filter | runs |
| dev-skills: the marketplace manifest and its skills (no tests) | `dev-skills-validation` | the `dev-skills` filter | runs |
| session-digest (`session-digest/tests/*.test.ts`), typecheck | `session-digest-core` | the `session-digest` filter | runs |
| loki (`loki/tests/*.test.js`) | `loki-core` | the `loki` filter, with every compose file: its label check reads those of the projects its allowlist names | runs |
| neris (`neris/packages/swift-neris/Tests/`) | `neris-core` | the `neris` filter | runs |
| claude-insights: the script's pytest and the functions' Deno tests | `claude-insights-core` | the `claude-insights` filter | runs |
| The langfuse stack (`tests/test_langfuse_shared_stack.py`) | `langfuse-core` | the `langfuse` filter | runs |
| mac-health (`tools/mac-health/tests/test-*.sh`) | `mac-health-core`: `tools/mac-health/tests/run-all.sh`, on `macos-latest` | the `mac-health` filter | runs |

Notes:

- warder pins gokit at a tag (`v0.1.0`), so a gokit change cannot break warder until gokit is tagged and warder moves to it; a gokit change runs `agister-core` only.
- `warder/cmd/warder/files_test.go`, `process_test.go` and `serve_test.go` are `//go:build unix`: they run on the `local-mac` runner and are skipped on any other OS.
- Agister, gokit, the gate and warder run on the self-hosted `local-mac` runner. When it is offline, the job waits queued, the `report` check stays pending, and GitHub fails the job after 24 hours: never a silent pass.

## Keeping it regular

Two things keep the table above from going stale (LAB-219):

- **Every test file runs some job.** `scripts/tests/ci-workflow-paths.test.js` lists every tracked test file (Go, Node, Python, Swift, Kotlin, shell) and fails when a change to one would select no job. A new project's tests fail there until a filter and a job cover them, or until `unfilteredTests` in that file names the reason they need none.
- **Every job runs weekly.** A push runs only the jobs its changed paths select, so a project nothing touches is never re-tested. `ci-weekly.yml` dispatches `ci.yml` on trunk each Sunday at 03:37 Moscow time; a manual dispatch runs every job, `real-provider-smoke` included, and the same test keeps that true. A failure arrives through `ci.yml`'s own Telegram notification.

## Notio Split

Notio has separate backend and frontend release units:

- `notio-core.yml` runs Swift tests from `notio/backend/`.
- `notio-frontend-core.yml` runs the frontend typecheck, tests, and build from `notio/frontend/`.
- `release-unit.yml` deploys `notio-backend_v<version>` tags to the VPS Docker service.
- `notio-frontend-deploy.yml` is release-only and reusable; `release-unit.yml` calls it for `notio-frontend_v<version>` tags after the frontend core gate. A Notio frontend release succeeds only after the production Cloudflare Pages app renders the expected `Version` text in the browser-rendered page-version smoke check.

There is no trunk-push Cloudflare Pages deploy path for Notio frontend.

## Shared Infrastructure

- **Path detection**: `dorny/paths-filter@v4` in the `changes` job
- **Failure notifications**: all pipelines route failures through `notify-telegram-failure.yml`
- **Concurrency**: scheduled workflows use `concurrency` groups to prevent overlap
- **Timezone**: cron schedules target Moscow morning (UTC+3), and `ci-weekly.yml` Sunday night, documented in each file
