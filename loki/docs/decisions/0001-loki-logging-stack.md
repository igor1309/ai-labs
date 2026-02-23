---
date: 2026-02-23
model: gpt-5.2
description: "Decision: single-host Loki+Grafana with host Alloy (journald-first), multi-project separation, and 14-day retention"
---

# Decision: Loki logging stack (single host, monolithic, multi-project)

## Status
Accepted (2026-02-23).

## Context
We want a single-host, self-hosted logging stack for multiple small projects where the primary query pattern is “show logs for day/hour”.

### Goals
- Centralize logs for multiple small projects on one stack.
- Enforce 14 days retention, uniformly.
- Keep operational complexity low.
- Support multi-project separation via a mandatory `project` label.
- Enable secure remote access to Grafana without opening inbound ports.

### Non-goals
- Elasticsearch-class full-text analytics, complex ad-hoc aggregations, or log-as-a-database use cases.
- High-cardinality stream partitioning (per-request, per-user, etc.).
- Kubernetes-native deployment.

## Decisions
### Deployment topology
- Grafana runs in Docker.
- Loki runs in Docker.
- Alloy runs on the host as a systemd service (same machine as Docker).

#### Why
- Host Alloy makes journald ingestion trivial.
- Dockerized Loki+Grafana keeps upgrades/rollbacks self-contained.

### Loki mode
- Run Loki in monolithic (single-binary) mode (no read/write split, no microservices).

#### Why
- Expected volume is hundreds of MB/day and primary queries are time-sliced.
- Monolithic mode minimizes operational overhead.

### Ingestion model (journald-first)
- The primary and standard ingestion path is journald.
- Docker containers must log to journald (Docker journald log driver).
- Core labels are injected by Alloy; applications must not self-assign `project`, `service`, or `env`.

#### Why
- A single ingestion substrate avoids parallel collection paths with divergent metadata.
- Centralized labeling prevents per-project drift and keeps the label contract enforceable.

### Label schema
Allowed labels (bounded cardinality, part of stream identity):
- `project` (mandatory)
- `env`
- `service` (canonical application/service identifier; `module` is not used as a label)
- `level`
- `model` (bounded set)
- `function` (logical operation identifier; bounded O(10–50))

Forbidden as labels (must stay in log body):
- `request_id`, `trace_id`, `span_id`
- `user_id`, `device_id`, `session_id`
- any unique per-event IDs

#### Why
- Loki stream identity must remain low-cardinality and stable to avoid stream explosion.

### Label derivation rules (deterministic)
All core labels (`project`, `service`, `env`) are derived centrally by Alloy. Applications must not override them.

#### systemd / journald sources
Source: `_SYSTEMD_UNIT`

Pattern:
```
<project>__<service>@<instance>.service
```

Rules:
- The `__` (double underscore) delimiter is reserved and must not appear inside `<project>` or `<service>`.
- The `@<instance>` suffix is mandatory, even for single-instance services.

Mapping:
- `project` = `<project>`
- `service` = `<service>`
- `env` = host-level environment variable `DEPLOY_ENV`

Example:
```
trend-scout__api@1.service
→ project=trend-scout
→ service=api
→ env=prod
```

#### Docker container sources (journald logging driver)
Required container labels:
- `com.logging.project`
- `com.logging.service`

Mapping:
- `project` = `com.logging.project`
- `service` = `com.logging.service`
- `env` = host-level environment variable `DEPLOY_ENV`

Example:
```
--label com.logging.project=trend-scout
--label com.logging.service=worker

→ project=trend-scout
→ service=worker
→ env=stage
```

#### Environment (`env`) sourcing
`env` is sourced exclusively from the host environment variable:
```
DEPLOY_ENV ∈ {dev, stage, prod}
```

Set at host provisioning time and shared by all services. Applications must not override `env`.

### Storage
- Store Loki data on the host filesystem (local persistence).

#### Why
- Volume and retention do not justify object storage yet.
- Local storage minimizes moving parts.

### Retention policy
- Apply a uniform TTL of 14 days to all logs.
- “Per-project” means segmentation by `project` label, not differentiated TTLs.

#### Why
- All projects share the same retention requirement; avoid multi-tenancy/override complexity.

### Query & UX
- Grafana Explore is the primary interface (time-slice browsing).
- Saved per-project queries are allowed; dashboards are optional.

#### Why
- Explore + stable labels supports interactive “day/hour” workflows without dashboard maintenance.

### Access & security
- Expose Grafana via Cloudflare Tunnel.
- Protect Grafana with Cloudflare Access.
- Terminate TLS at the Cloudflare edge.

#### Why
- Avoids exposing inbound Grafana ports and adds an identity-based gate before Grafana.

## Consequences
- Multi-project separation and saved queries depend on correct and consistent `project`/`service` label injection.
- Backups are host-level volume snapshots if needed.
- Capacity is managed primarily via retention window.
- Re-architecture is only considered if ingestion/query latency or storage pressure becomes unacceptable.

### Label compliance enforcement
To prevent drift, add a lightweight CI check:
- Validate that all container definitions / deploy manifests define:
  - `com.logging.project`
  - `com.logging.service`
- Reject builds or deployments that omit required labels.

## Alternatives considered
- Direct public exposure (firewall + HTTPS): rejected (unnecessary attack surface for an admin UI).
- VPN-only access (WireGuard/Tailscale): rejected (more friction than Cloudflare Access for browser-native access).

## Summary
Deploy a single-host, monolithic Loki with Grafana in Docker and Alloy as a host service ingesting a journald-first log plane (including Docker containers via journald logging). Enforce a uniform 14-day retention window with multi-project separation via a mandatory `project` label and deterministic label derivation. Expose Grafana through Cloudflare Tunnel and protect it with Cloudflare Access, keeping origin ports closed.
