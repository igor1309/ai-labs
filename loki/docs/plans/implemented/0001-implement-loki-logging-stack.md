---
date: 2026-02-23
model: gpt-5.2
description: "Top-level implementation plan for single-host Loki+Grafana with host Alloy (journald-first), Cloudflare Tunnel access, and 14-day retention."
---

# Implementation plan: Loki logging stack (single host, multi-project)

## Scope
Implement the decision in `loki/docs/decisions/0001-loki-logging-stack.md`:
- Single VPS host
- Loki + Grafana in Docker
- Alloy on the host (systemd), journald-first ingestion
- Uniform 14-day retention
- Multi-project separation via mandatory `project` label
- Grafana access via Cloudflare Tunnel + Cloudflare Access (no inbound Grafana ports)

## Assumptions
- Target host: existing VPS at `<VPS_IP>` running Ubuntu `24.04`.
- A Cloudflare-managed domain is available and Cloudflare Access can be configured.
- We will document an initial allowlist of `project` and `service` values to keep them bounded (and update it via PR when onboarding changes).

## Closed decisions (from open questions)
- VPS: use the existing host `<VPS_IP>` (Ubuntu `24.04`).
- Storage: use a dedicated data volume for Loki persistence (mounted on the host).
- Pilot onboarding: `project=oracle` (first project to onboard end-to-end).
- Alerting (iteration 1): enable Grafana alerting to Telegram for:
  - host disk usage
  - Loki/Grafana/Alloy service health
  - “no logs received” (ingestion stalled)

## Label policy (source of truth: decision 0001)
This plan implements (and must not contradict) `loki/docs/decisions/0001-loki-logging-stack.md`.

### Label schema
Allowed labels (bounded cardinality; part of stream identity):
- `project` (mandatory)
- `env`
- `service`
- `level`
- `model`
- `function`

Forbidden as labels (must remain in log body):
- `request_id`, `trace_id`, `span_id`
- `user_id`, `device_id`, `session_id`
- any unique per-event IDs

### Core label derivation rules
- Alloy injects `project`, `service`, `env`. Applications must not self-assign or override them.
- `env` is sourced exclusively from host environment variable `DEPLOY_ENV ∈ {dev, stage, prod}` (for the single host in this plan, it will be set to one value, typically `prod`).
- systemd unit naming reserves `__` as a delimiter; it must not appear inside `<project>` or `<service>`.

### Non-core label derivation rules (`level`, `model`, `function`)
These labels are optional and may only be derived centrally by Alloy (never by “trusting” arbitrary application-provided label sets).

- `level` derivation (deterministic):
  - If the log payload is structured JSON and contains a level field (`level` or `severity`) whose value maps into `debug|info|warn|error`, Alloy sets `level` from that mapped value.
  - Otherwise, Alloy derives `level` from journald priority (`PRIORITY`) using a documented mapping (e.g. `0–3 → error`, `4 → warn`, `5–6 → info`, `7 → debug`).
- `model` derivation:
  - Alloy extracts `model` only from structured JSON payload field `model`.
  - Alloy sets `model` as a label only when the value is in the repo-defined allowlist for that `project` (see Phase 6). Otherwise the value remains in the log body (not a label).
- `function` derivation:
  - Alloy extracts `function` only from structured JSON payload field `function`.
  - Alloy sets `function` as a label only when the value is in the repo-defined allowlist for that `project/service` (see Phase 6). Otherwise the value remains in the log body (not a label).

### Bounds and change control
- Maintain an explicit allowlist of `project` and `service` values as part of Phase 6 onboarding docs.
- Treat onboarding a new `project`/`service` value as a deliberate change: update docs and CI checks in the same PR as the onboarding change.

## Execution lock (for when this plan is executed)
- Worktree required: yes
- Expected worktree: `worktrees/loki-logging-stack`
- Expected branch: `codex/loki-logging-stack`
- Preflight check: [x] done (`git worktree list --porcelain` and `git branch --show-current`)

## Repo artifacts (tracked in git)
When executed, this plan adds repo-tracked artifacts under `loki/`:

- `loki/stack/`: Docker Compose stack and provisioning files for Loki + Grafana (no secrets committed).
- `loki/scripts/`: CI checks and local helper scripts (label compliance, allowlists).
- `loki/docs/onboarding/`: onboarding checklist, and the allowlists that bound label values per project/service.

## Phase 1: VPS provisioning and hardening
### Deliverables
- A provisioned VPS with a dedicated non-root admin user and SSH key auth.
- Firewall configured to minimize inbound access (SSH only; Grafana not exposed publicly).
- Host environment configured with `DEPLOY_ENV ∈ {dev, stage, prod}`.
- Host disk layout supports Loki persistence via a dedicated mounted data volume.

### Verification
- SSH access works using key auth; password auth is disabled.
- Inbound ports: only SSH is reachable; Grafana is not reachable from the public internet.
- `DEPLOY_ENV` is present for systemd services (and survives reboot).

## Phase 2: Host runtime prerequisites (journald + Docker)
### Deliverables
- journald configured for persistent storage and bounded disk usage:
  - Persistent journals enabled (under `/var/log/journal`).
  - A dedicated journald drop-in (e.g. `/etc/systemd/journald.conf.d/loki-stack.conf`) defines caps (example starting point; tune after observing volume):
    - `SystemMaxUse=2G`
    - `SystemKeepFree=5G`
- Docker installed and configured to use the journald logging driver for containers.
- A standard place for stack configuration and secrets (permissions locked down):
  - configs under `/etc/loki-stack/` (root-owned, not world-readable)
  - data under a dedicated mounted host path (not inside the repo)
  - secrets provided via root-only systemd `EnvironmentFile=` and Docker Compose `env_file:` (never committed)

### Verification
- Container stdout/stderr appears in journald.
- journald size limits are effective:
  - `journalctl --disk-usage` stays under `SystemMaxUse` after generating sustained container logs for a fixed interval (e.g. 10 minutes).
  - journald does not consume the reserved free space implied by `SystemKeepFree`.

## Phase 3: Deploy Loki + Grafana (Docker Compose)
### Deliverables
- Docker Compose stack for Loki and Grafana with host-mounted persistence.
- Loki configured in monolithic mode with 14-day retention.
- Grafana configured with initial admin access, and Loki data source provisioned.

### Verification
- Grafana can query Loki locally on the host.
- Logs are queryable in Explore by time slice.
- Retention is enforced (validate retention behavior in a disposable/local Loki instance, e.g. via OrbStack on macOS, or in a non-prod environment by temporarily setting a short retention, observing expiry, then configuring 14 days for the live stack; do not change retention on the live stack for validation).

## Phase 4: Install and configure Alloy (host systemd)
### Deliverables
- Alloy installed as a systemd service.
- Alloy configuration that ingests journald and injects labels per the decision:
  - `project`, `service` derived centrally (never overridden by apps)
  - `env` derived only from `DEPLOY_ENV`
  - forbidden labels remain in log body
  - Deterministic mappings implemented for:
    - systemd units using `_SYSTEMD_UNIT` naming: `<project>__<service>@<instance>.service`
      - The `@<instance>` suffix is mandatory, even for single-instance services.
    - Docker containers using container labels: `com.logging.project`, `com.logging.service` (enriched via Docker discovery, joined to journald entries via container ID)
  - Extraction and enforcement for non-core labels per “Non-core label derivation rules”:
    - `level` derived deterministically (payload-first when mappable, else journald priority mapping)
    - `model` / `function` labels only when values are allowlisted; otherwise remain in the log body

### Verification
- For a systemd test service named `trend-scout__api@1.service`, logs appear in Loki with:
  - `project=trend-scout`, `service=api`, `env=<DEPLOY_ENV>`
- For a Docker test container labeled with `com.logging.project` and `com.logging.service`, logs appear with the same labels.
- Docker label enrichment mechanism is verified explicitly (document which journald field contains the container identity used for the join, and confirm label injection is not coming from log payload).
- Attempts to self-assign `project/service/env` from application log payload do not override injected labels.

## Phase 5: Secure access via Cloudflare Tunnel + Access
### Deliverables
- `cloudflared` installed and managed via systemd.
- Cloudflare Tunnel routes a hostname to Grafana on the private host network.
- Cloudflare Access policy restricts Grafana to allowed identities.
- TLS terminates at Cloudflare edge; origin stays private.

### Verification
- Grafana is reachable only via the Cloudflare Access-protected hostname.
- Direct public access to Grafana remains closed.
- Tunnel auto-recovers after VPS reboot.

## Phase 6: Project onboarding rules and CI enforcement
### Deliverables
- A minimal “label compliance” check (CI) that scans Docker Compose service definitions in all Compose manifests in the repo and fails when required Docker labels are missing:
  - `docker-compose*.yml`, `docker-compose*.yaml`
  - `compose*.yml`, `compose*.yaml`
  - `com.logging.project`
  - `com.logging.service`
  - Note: iteration 1 is scoped to Docker Compose only; any new non-Compose container manifests must extend this check in the same PR.
- A documented onboarding checklist for new services:
  - systemd unit naming rule (when applicable)
  - Docker container label rule (when applicable)
  - bounds (to keep cardinality predictable):
    - `project`: allowlist only
    - `service`: allowlist only (scoped to `project`)
    - `level`: bounded set (e.g. `debug|info|warn|error`)
    - `model`: allowlist only (bounded set)
    - `function`: bounded per service (target O(10–50))
  - allowlist for known `project` and `service` values (and the PR/change process to extend it)
  - rule: CI rejects `com.logging.project` / `com.logging.service` values that are not in the allowlist (to keep cardinality bounded)
  - allowlists for non-core label values:
    - `model`: allowlist per `project`
    - `function`: allowlist per `project/service` (target O(10–50))
  - repo location for allowlists (single source of truth):
    - `loki/docs/onboarding/label-allowlists.yml`

### Verification
- A sample project/container definition missing labels fails the compliance check.
- A sample project/container definition with `com.logging.project` / `com.logging.service` not in the allowlist fails the compliance check.
- At least one real project is onboarded end-to-end and queries correctly by `project` and `service`.

## Phase 7: Operations (backups, upgrades, and capacity)
### Deliverables
- Backup strategy for Loki data on host filesystem (snapshot or file-level backup).
- Upgrade procedure for Loki/Grafana images and Alloy, including rollback.
- A basic capacity checklist:
  - disk usage trend
  - ingestion rate expectations
  - retention window validation
- Grafana alerting configured to notify Telegram for:
  - host disk usage thresholds
  - Loki/Grafana/Alloy service health
  - “no logs received” (ingestion stalled)

### Verification
- Backup restore drill succeeds in a test environment (or a documented dry-run procedure is verified).
- Upgrade + rollback procedure is exercised once.
- Alerts deliver to Telegram and can be acknowledged/disabled without host access.

## Acceptance criteria
- Logs from systemd and Docker land in Loki with correct labels and bounded cardinality.
- Grafana Explore supports “day/hour” workflows per project with saved queries.
- 14-day retention is enforced uniformly.
- Grafana is not publicly exposed; access is only via Cloudflare Access.
