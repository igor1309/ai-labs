---
date: 2026-02-26
status: proposed
scope: Nomos V0 (Phase 1)
runtime: Express (Node.js)
oracle-migration: out of scope (standalone first)
worktree required: yes
expected worktree: worktrees/nomos-v0
expected branch: codex/nomos-v0
preflight check: [ ] done
---

# Nomos V0 Implementation Plan

## Overview

Nomos is an AI sovereignty layer that centralizes vendor control, cost governance, unified API surface, and basic prompt safeguards. It runs as a standalone Express service on a VPS with SQLite persistence, Caddy reverse proxy, and Docker Compose deployment.

Oracle is the first consumer but Oracle migration is out of scope for this plan.

## Source Documents

- `nomos/docs/nomos.md` — project definition, scope, non-goals
- `nomos/docs/adr-0001.md` — VPS-first deployment decision
- `nomos/docs/infra.md` — infrastructure decisions (V0)
- `nomos/docs/runner-selection.md` — runner abstraction and routing
- `nomos/docs/testability.md` — day-0 testability requirements
- `nomos/docs/ops-runbook-v0.md` — operations runbook

## Tech Decisions

- **Runtime**: Node.js with Express
- **Persistence**: SQLite with WAL mode
- **Streaming**: Server-Sent Events (SSE)
- **Testing**: Node built-in test runner (repo convention)
- **Language**: Plain JS (repo convention)
- **Deployment**: Docker Compose + Caddy

---

## Cross-Cutting: Dev Environment, Testing & CI

These are not a phase — they are invariants that every phase must satisfy.

- **Local dev**: `npm test` runs fast in-process unit/integration tests. `docker compose up` runs the full local stack (Nomos + Caddy) for manual verification. Both must work on every commit.
- **Unit/integration tests**: every phase ships tests alongside code. No feature merges without test coverage for the new behavior. These run fast, in-process, no Docker required.
- **CI pipeline (every push)**: runs `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit`. Gate is mandatory — red CI blocks merge.
- **E2E tests (release pipeline)**: E2E tests run against the Docker/Caddy stack and are expensive. They run in the release pipeline, not on every push. Phase 1 establishes the first e2e smoke test (health check). Each subsequent phase extends the e2e suite.
- **Release cadence**: each phase culminates in a release. The release pipeline runs the full e2e suite, so every phase exit validates all accumulated e2e tests.
- **Phase exit rule**: a phase is not done until unit/integration tests, CI, and the release pipeline (including e2e) are green.

---

## Phase 1: Project Scaffold + Deployable Skeleton

**Goal**: Establish package structure, Express app, local dev workflow, test infra, CI pipeline, and deployment infra. First commit is a deployable, testable, CI-gated service.

- [ ] Create `nomos/` package structure: `src/`, `tests/`, `package.json`
- [ ] Wire into monorepo test script in root `package.json`
- [ ] Express app entry point with health endpoint (`GET /health`)
- [ ] Structured JSON logging to stdout
- [ ] Local dev workflow: `npm test` for fast unit tests, `docker compose up` for full local stack
- [ ] Dockerfile (Node.js + Express, non-root user, health check)
- [ ] `docker-compose.yml` (nomos + caddy services, restart: unless-stopped, data volume)
- [ ] Caddyfile (TLS termination, SSE-aware reverse proxy, no buffering)
- [ ] Env-based configuration (`.env` template with all config knobs)
- [ ] CI pipeline: tests + typecheck on every push, merge blocked on red
- [ ] Unit tests: health endpoint responds, app starts/stops cleanly
- [ ] E2E smoke test (release pipeline): Docker Compose up → Caddy → health check green

**Key constraint**: The skeleton must be deployable, testable locally, and CI-gated before any feature work begins. This phase establishes the dev experience that all subsequent phases inherit.

**Exit gate**: CI green (tests + typecheck). Release pipeline green (e2e health check).

---

## Phase 2: Runner Abstraction

**Goal**: Core testability foundation — the runner boundary and StubRunner.

- [ ] Define Runner protocol (execute request, return response, support streaming)
- [ ] Implement StubRunner with deterministic JSON fixtures
- [ ] Implement StubRunner scripted SSE streams (chunk, error, end events)
- [ ] Fixture loading from filesystem (read-only in V0)
- [ ] Tests: assert fixture loading, event ordering, stream termination

**Key constraint**: Runner protocol is owned by its client (per repo architecture rules). StubRunner and LiveRunner implement the same protocol.

**Exit gate**: CI green. Release pipeline green (e2e suite).

---

## Phase 3: Auth & Project Identity

**Goal**: Static bearer token validation and scope enforcement.

- [ ] SQLite schema: projects table (id, name, token_hash, scope, active)
- [ ] Token validation middleware: extract bearer token, hash-compare, resolve project
- [ ] Scope enforcement: `scope=live` allows `/v1/*`, `scope=stub` allows `/stub/v1/*`
- [ ] Redaction: never log raw tokens, log only hashed/partial form
- [ ] Tests: valid token, invalid token, wrong scope, expired/inactive project

**Key constraint**: Tokens are static per project in V0. Token rotation is an operational procedure (not an API).

**Exit gate**: CI green. Release pipeline green (e2e suite).

---

## Phase 4: Unified API Proxy + SSE Streaming

**Goal**: OpenAI-compatible HTTP surface with streaming and runner dispatch.

- [ ] OpenAI-compatible routes (`POST /v1/chat/completions`)
- [ ] SSE streaming passthrough (vendor stream → client stream, minimal transformation)
- [ ] LiveRunner implementation: real vendor HTTP calls with configurable `base_url`, `timeout_ms`, optional `headers`
- [ ] Runner dispatch by namespace: `/v1/*` → LiveRunner, `/stub/v1/*` → StubRunner
- [ ] Stub API gated by `NOMOS_STUB_ENABLED` config (disabled in prod → 404)
- [ ] Tests: request parsing, SSE framing, runner routing, stub toggle, configurable endpoints
- [ ] E2E test (release pipeline): SSE streaming validation through Docker/Caddy stack

**Key constraint**: Streaming is a day-0 requirement. Caddy must not buffer SSE (validated via e2e in release pipeline).

**Exit gate**: CI green. Release pipeline green (e2e suite incl. SSE streaming through Caddy).

---

## Phase 5: Cost Control & Budget Enforcement

**Goal**: Token usage tracking and per-project budget limits with hard stop.

- [ ] SQLite schema: usage_log (project_id, model, prompt_tokens, completion_tokens, timestamp)
- [ ] SQLite schema: budgets (project_id, limit_tokens, period, current_usage)
- [ ] Post-completion hook: log token usage from vendor response
- [ ] Pre-request check: reject if project budget exceeded (hard stop)
- [ ] Simple usage report endpoint (`GET /v1/usage?project=...`)
- [ ] Tests: usage logging, budget enforcement, hard stop, budget reset per period

**Exit gate**: CI green. Release pipeline green (e2e suite).

---

## Phase 6: Prompt Safeguards

**Goal**: Best-effort input sanitization and injection detection.

- [ ] Input sanitization: strip/escape known dangerous patterns
- [ ] Basic injection pattern detection (regex-based, configurable patterns)
- [ ] Optional system prompt reinforcement (prepend/append safety instructions)
- [ ] Suspicious payload logging (redacted) for audit
- [ ] Configuration: enable/disable per safeguard, pattern list
- [ ] Tests: known injection patterns detected, clean input passes, redaction works

**Key constraint**: No illusion of perfect safety. Best-effort only.

**Exit gate**: CI green. Release pipeline green (e2e suite).

---

## Final Gates

- [ ] Full unit/integration test suite green
- [ ] TypeScript check passes (noEmit)
- [ ] CI pipeline green on all checks
- [ ] Release pipeline: full e2e suite green (stub request through Docker/Caddy stack: auth → budget check → safeguards → StubRunner → SSE response)
- [ ] Move this plan to `nomos/docs/plans/implemented/`
