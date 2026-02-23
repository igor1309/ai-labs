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
- Target host: existing VPS at `95.164.53.144` running Ubuntu `24.04`.
- A Cloudflare-managed domain is available and Cloudflare Access can be configured.
- We can enumerate the initial set of `project` and `service` values to keep them bounded.

## Closed decisions (from open questions)
- VPS: use the existing host `95.164.53.144` (Ubuntu `24.04`).
- Storage: use a dedicated data volume for Loki persistence (mounted on the host).
- Pilot onboarding: `project=oracle` (first project to onboard end-to-end).
- Alerting (iteration 1): enable Grafana alerting to Telegram for:
  - host disk usage
  - Loki/Grafana/Alloy service health
  - “no logs received” (ingestion stalled)

## Execution lock (for when this plan is executed)
- Worktree required: yes
- Expected worktree: `worktrees/loki-logging-stack`
- Expected branch: `codex/loki-logging-stack`
- Preflight check: [ ] done (`git worktree list --porcelain` and `git branch --show-current`)

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
- journald configured for persistent storage and bounded disk usage.
- Docker installed and configured to use the journald logging driver for containers.
- A standard place for stack configuration and secrets (permissions locked down).

### Verification
- Container stdout/stderr appears in journald.
- journald retention/size limits are effective (disk usage stays bounded under load testing).

## Phase 3: Deploy Loki + Grafana (Docker Compose)
### Deliverables
- Docker Compose stack for Loki and Grafana with host-mounted persistence.
- Loki configured in monolithic mode with 14-day retention.
- Grafana configured with initial admin access, and Loki data source provisioned.

### Verification
- Grafana can query Loki locally on the host.
- Logs are queryable in Explore by time slice.
- Retention is enforced (policy config reviewed and validated with a short TTL test in a non-prod environment).

## Phase 4: Install and configure Alloy (host systemd)
### Deliverables
- Alloy installed as a systemd service.
- Alloy configuration that ingests journald and injects labels per the decision:
  - `project`, `service` derived centrally (never overridden by apps)
  - `env` derived only from `DEPLOY_ENV`
  - forbidden labels remain in log body
- Deterministic mappings implemented for:
  - systemd units using `_SYSTEMD_UNIT` naming: `<project>__<service>@<instance>.service`
  - Docker containers using container labels: `com.logging.project`, `com.logging.service`

### Verification
- For a systemd test service named `trend-scout__api@1.service`, logs appear in Loki with:
  - `project=trend-scout`, `service=api`, `env=<DEPLOY_ENV>`
- For a Docker test container labeled with `com.logging.project` and `com.logging.service`, logs appear with the same labels.
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
- A minimal “label compliance” check that fails when required Docker labels are missing:
  - `com.logging.project`
  - `com.logging.service`
- A documented onboarding checklist for new services:
  - systemd unit naming rule (when applicable)
  - Docker container label rule (when applicable)
  - bounds for `project/service/model/function/level`

### Verification
- A sample project/container definition missing labels fails the compliance check.
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
