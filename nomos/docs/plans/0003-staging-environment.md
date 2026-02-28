---
date: 2026-02-28
model: claude-opus-4-6
description: "Implementation plan for Nomos staging environment (ADR-0003)"
---

# Plan: Nomos Staging Environment

Source: ADR-0003 (Staging Environment)
Related: ADR-0001 (VPS-first deployment), ADR-0002 (CI/CD deployment via SSH)

Worktree required: yes
Expected worktree: `worktrees/nomos-staging`
Expected branch: `codex/nomos-staging`
Preflight check: [ ] done

---

## ADR Traceability Matrix

| ADR-0003 Invariant | Phase |
|---|---|
| Staging runs as separate Docker Compose project (`nomos-staging`) with own container name, volume, env file | 1 |
| Staging listens on internal port 8081 | 1 |
| Staging uses same vendor API key and base URL as production | 1 |
| Staging has own SQLite database; no cross-environment data leakage | 1 |
| Staging has `NOMOS_STUB_ENABLED=false` | 1 |
| `docker-compose.staging.yml` committed | 1 |
| `.env.staging.example` committed | 1 |
| Single Caddy serves both production and staging domains | 2 |
| DNS A-record for `staging.<NOMOS_DOMAIN>` documented | 2 |
| VPS Caddyfile updated to route both domains (documented, not repo Caddyfile) | 2 |
| `docs/vps-deployment-guide.md` documents staging setup | 2 |
| `deploy-nomos` split into `deploy-nomos-staging` → `deploy-nomos-prod` | 3 |
| `deploy-nomos-staging` deploys to staging and runs smoke test (health + real LLM call) | 3 |
| `deploy-nomos-prod` runs only after `deploy-nomos-staging` succeeds | 3 |
| Staging smoke test uses `NOMOS_STAGING_SMOKE_TOKEN` and staging domain | 3 |
| `github-release` depends on `deploy-nomos-prod` | 3 |
| Production `.env` has `NOMOS_STUB_ENABLED=false` | — (already satisfied, no change) |

---

## Phase 1: Staging stack definition

### Objective

Commit the repository artifacts that define the staging Docker Compose stack, isolated from production.

### ADR invariants addressed

- Separate Docker Compose project (`nomos-staging`), container name (`nomos-staging`), volume (`nomos-staging-data`), env file (`.env.staging`).
- Internal port 8081.
- Same vendor API key and base URL as production.
- Own SQLite database via separate volume.
- `NOMOS_STUB_ENABLED=false`.

### Deliverables

- `nomos/docker-compose.staging.yml`
- `nomos/.env.staging.example`

### Acceptance criteria

- The staging compose file is a valid Docker Compose specification that can be parsed without error.
- The staging compose file uses project name `nomos-staging`, container name `nomos-staging`, volume `nomos-staging-data`, and maps internal port 8081.
- No resource name (project, container, volume, network) collides with `docker-compose.yml` or `docker-compose.e2e.yml`.
- `.env.staging.example` sets `NOMOS_PORT=8081`, `NOMOS_STUB_ENABLED=false`, and `NOMOS_DB_PATH=data/nomos.db` (separate volume ensures separate database).
- Full test suite passes: `./scripts/run_silent.sh "tests" npm test`.
- Build passes: `./scripts/run_silent.sh "build" npx tsc --noEmit`.

### Edge cases

- If both staging and production compose stacks are brought up on the same host, they must not conflict on port bindings, container names, or volume names. The staging compose file must not expose host ports (Caddy handles external routing).
- `.env.staging.example` must not contain real secrets. It is a template only.

---

## Phase 2: Deployment documentation

### Objective

Document the VPS-side setup required for staging: Caddyfile changes, DNS, env file creation, and operational procedures.

### ADR invariants addressed

- Single Caddy serves both `<NOMOS_DOMAIN>` and `staging.<NOMOS_DOMAIN>`.
- DNS A-record for `staging.<NOMOS_DOMAIN>` points to VPS IP.
- `docs/vps-deployment-guide.md` documents staging setup.
- VPS Caddyfile updated to route both domains (documented, not repo Caddyfile).

### Deliverables

- `nomos/docs/vps-deployment-guide.md`

### Acceptance criteria

- Guide covers: DNS setup, VPS Caddyfile configuration for both domains, `.env.staging` creation from template, staging stack startup, and staging smoke-test project registration.
- Guide references `docker-compose.staging.yml` from Phase 1.
- Repo Caddyfile (`nomos/Caddyfile`) is unchanged.
- Full test suite passes: `./scripts/run_silent.sh "tests" npm test`.
- Build passes: `./scripts/run_silent.sh "build" npx tsc --noEmit`.

### Automated verification note

This phase adds documentation only — no behavioral change. Automated verification relies on the existing CI gate (build + test suite). The deployment guide's correctness is validated operationally when the staging stack is first brought up (Phase 3 pipeline exercises the documented setup).

### Edge cases

- Guide must note that staging and production share VPS resources and warn about resource contention under simultaneous load.
- Guide must specify that `.env.staging` must be created from `.env.staging.example` and populated with real values; it must never be committed.

---

## Phase 3: Release pipeline staging gate

### Objective

Split the existing `deploy-nomos` CI job into a two-stage promotion pipeline: deploy to staging, smoke-test staging, then deploy to production.

### ADR invariants addressed

- `deploy-nomos` split into `deploy-nomos-staging` → `deploy-nomos-prod`.
- `deploy-nomos-staging` deploys to staging stack and runs smoke test (health check + real LLM call via staging domain).
- `deploy-nomos-prod` runs only after `deploy-nomos-staging` succeeds.
- Staging smoke test uses `NOMOS_STAGING_SMOKE_TOKEN` and staging domain.
- `github-release` depends on `deploy-nomos-prod`.

### Deliverables

- Updated `.github/workflows/release-unit.yml`

### Acceptance criteria

- Workflow YAML is valid and parseable.
- `deploy-nomos-staging` job exists, conditioned on `needs.verify.outputs.basename == 'nomos'`, depends on `core`.
- `deploy-nomos-staging` deploys to the staging compose stack on the VPS and runs a health check and real LLM smoke test against the staging domain.
- `deploy-nomos-prod` job exists, depends on `deploy-nomos-staging`.
- `deploy-nomos-prod` deploys to the production compose stack and runs the existing production health check and smoke test.
- `github-release` job depends on `deploy-nomos-prod`.
- Notification job references both staging and production deploy results.
- Full test suite passes: `./scripts/run_silent.sh "tests" npm test`.
- Build passes: `./scripts/run_silent.sh "build" npx tsc --noEmit`.

### Edge cases

- If staging smoke test fails, production deploy must not execute. The pipeline must halt.
- If staging deploy succeeds but smoke test fails, the staging container remains running with the new version (no automatic rollback — consistent with ADR-0003 non-goals).
- The staging smoke test must use a dedicated smoke token (`NOMOS_STAGING_SMOKE_TOKEN` secret) distinct from the production smoke token.

---

## Scope guardrails

The following are explicitly excluded from this plan:

- Application code changes (no source files under `nomos/src/` are modified).
- Removing or modifying the stub runner code (it remains config-gated per ADR-0003).
- Changes to the repo-local Caddyfile (`nomos/Caddyfile`).
- Blue-green deployment, zero-downtime deployment, automated rollback.
- PR-based preview deployments.
- Separate VPS for staging.
- Shared database between environments.
- Load testing or performance benchmarking.
- DNS provisioning or VPS configuration (documented only).

---

## Completion definition

The implementation is complete when:

- All ADR-0003 invariants in the traceability matrix are addressed by committed artifacts.
- The staging compose stack can be brought up independently on the VPS without conflicting with the production stack.
- The release pipeline deploys to staging first, validates via smoke test, and promotes to production only on success.
- `./scripts/run_silent.sh "build" npx tsc --noEmit` passes.
- `./scripts/run_silent.sh "tests" npm test` passes.
- VPS setup is documented in `docs/vps-deployment-guide.md`.
