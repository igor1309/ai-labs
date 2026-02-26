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

## Phase 1: Project Scaffold + Deployable Skeleton

**Goal**: Establish package structure, Express app, deployment infra, and CI. First commit is a deployable service.

- [ ] Create `nomos/` package structure: `src/`, `tests/`, `package.json`
- [ ] Wire into monorepo test script in root `package.json`
- [ ] Express app entry point with health endpoint (`GET /health`)
- [ ] Structured JSON logging to stdout
- [ ] Dockerfile (Node.js + Express, non-root user, health check)
- [ ] `docker-compose.yml` (nomos + caddy services, restart: unless-stopped, data volume)
- [ ] Caddyfile (TLS termination, SSE-aware reverse proxy, no buffering)
- [ ] Env-based configuration (`.env` template with all config knobs)
- [ ] CI pipeline wiring
- [ ] Tests: health endpoint responds, app starts/stops cleanly

**Key constraint**: The skeleton must be deployable end-to-end (Docker Compose up → Caddy → health check green) before any feature work begins.

**Exit gate**: `./scripts/run_silent.sh "tests" npm test` passes. Docker Compose up + health check succeeds.

---

## Phase 2: Runner Abstraction

**Goal**: Core testability foundation — the runner boundary and StubRunner.

- [ ] Define Runner protocol (execute request, return response, support streaming)
- [ ] Implement StubRunner with deterministic JSON fixtures
- [ ] Implement StubRunner scripted SSE streams (chunk, error, end events)
- [ ] Fixture loading from filesystem (read-only in V0)
- [ ] Tests: assert fixture loading, event ordering, stream termination

**Key constraint**: Runner protocol is owned by its client (per repo architecture rules). StubRunner and LiveRunner implement the same protocol.

**Exit gate**: `./scripts/run_silent.sh "tests" npm test` passes.

---

## Phase 3: Auth & Project Identity

**Goal**: Static bearer token validation and scope enforcement.

- [ ] SQLite schema: projects table (id, name, token_hash, scope, active)
- [ ] Token validation middleware: extract bearer token, hash-compare, resolve project
- [ ] Scope enforcement: `scope=live` allows `/v1/*`, `scope=stub` allows `/stub/v1/*`
- [ ] Redaction: never log raw tokens, log only hashed/partial form
- [ ] Tests: valid token, invalid token, wrong scope, expired/inactive project

**Key constraint**: Tokens are static per project in V0. Token rotation is an operational procedure (not an API).

**Exit gate**: `./scripts/run_silent.sh "tests" npm test` passes.

---

## Phase 4: Unified API Proxy + SSE Streaming

**Goal**: OpenAI-compatible HTTP surface with streaming and runner dispatch.

- [ ] OpenAI-compatible routes (`POST /v1/chat/completions`)
- [ ] SSE streaming passthrough (vendor stream → client stream, minimal transformation)
- [ ] LiveRunner implementation: real vendor HTTP calls with configurable `base_url`, `timeout_ms`, optional `headers`
- [ ] Runner dispatch by namespace: `/v1/*` → LiveRunner, `/stub/v1/*` → StubRunner
- [ ] Stub API gated by `NOMOS_STUB_ENABLED` config (disabled in prod → 404)
- [ ] Tests: request parsing, SSE framing, runner routing, stub toggle, configurable endpoints
- [ ] End-to-end SSE streaming validation through Caddy

**Key constraint**: Streaming is a day-0 requirement. Caddy must not buffer SSE (validated here against the Phase 1 infra).

**Exit gate**: `./scripts/run_silent.sh "tests" npm test` passes.

---

## Phase 5: Cost Control & Budget Enforcement

**Goal**: Token usage tracking and per-project budget limits with hard stop.

- [ ] SQLite schema: usage_log (project_id, model, prompt_tokens, completion_tokens, timestamp)
- [ ] SQLite schema: budgets (project_id, limit_tokens, period, current_usage)
- [ ] Post-completion hook: log token usage from vendor response
- [ ] Pre-request check: reject if project budget exceeded (hard stop)
- [ ] Simple usage report endpoint (`GET /v1/usage?project=...`)
- [ ] Tests: usage logging, budget enforcement, hard stop, budget reset per period

**Exit gate**: `./scripts/run_silent.sh "tests" npm test` passes.

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

**Exit gate**: `./scripts/run_silent.sh "tests" npm test` passes.

---

## Final Gates

- [ ] Full test suite green
- [ ] TypeScript check passes (noEmit)
- [ ] End-to-end: stub request through full stack (auth → budget check → safeguards → StubRunner → SSE response)
- [ ] Docker Compose up + health check + streaming smoke test
- [ ] Move this plan to `nomos/docs/plans/implemented/`
