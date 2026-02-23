# Loki Logging Stack — Design Decisions (Monolithic, Multi-Project, Host Alloy)

## Decision Record

- **Status:** Decided
- **Date:** 2026-02-23
- **Owner:** Igor Malyarov
- **Scope:** Single-host, self-hosted logging stack for multiple small projects (debugging + time-slice browsing).

## Goals

- Centralize logs for multiple small projects on a single stack.
- Primary query pattern: **“show logs for day/hour”** (time-slice browsing).
- Enforce **14 days retention** for logs, with **project separation keyed by `project` label**.
- Keep operational complexity low.
- Enable secure remote access to Grafana without opening inbound ports.

## Non-Goals

- Elasticsearch-class full-text analytics, complex ad-hoc aggregations, or log-as-a-database use cases.
- High-cardinality stream partitioning (per-request, per-user, etc.).
- Kubernetes-native deployment (this is a single-host design).

## Deployment Topology

### Runtime placement

- **Grafana:** Docker container
- **Loki:** Docker container
- **Alloy:** Host service (systemd), runs on the same machine as Docker

Rationale:
- Alloy on the host provides **trivial journald ingestion**.
- Loki+Grafana in Docker keeps the stack self-contained and easy to upgrade/rollback.

### Loki mode

- **Monolithic (single-binary) Loki**
- No microservices split; no read/write separation.

Rationale:
- Volume is **hundreds of MB/day**, and the primary query is time-slicing.
- Monolithic mode minimizes operational overhead and is sufficient for scale.

## Ingestion Model

### Single ingestion plane: journald-first

- **Primary and standard ingestion path:** **journald**
- **Docker logs policy:** project containers MUST log to journald (Docker journald log driver)

Rationale:
- A single ingestion substrate (journald) avoids having two parallel collection paths with divergent metadata.
- Journald provides consistent enrichment points (unit name, identifiers) and reduces “optional forever” drift.

### Label injection point

- **All labels are applied at the collector (Alloy) layer**, based on journald metadata and deployment conventions.

Rationale:
- Centralized labeling avoids per-app inconsistencies and keeps labeling policy enforceable.

## Storage

- **Local storage** on the host (filesystem-backed persistence for Loki data).

Rationale:
- Data volume and retention horizon do not justify object storage at this stage.
- Local storage reduces moving parts and keeps the system fully self-hosted.

## Retention Policy

### Retention semantics (explicit)

- **Uniform TTL:** 14 days applied to **all projects equally**
- **“Per project” means:** queries and log segmentation are keyed by `project` label; retention is not differentiated by project.

Rationale:
- The stated requirement is 14 days for each project; there is no requirement for different TTLs per project.
- Avoids multi-tenancy / overrides complexity while preserving the ability to segment by project.

Constraint:
- If differentiated per-project retention is required in the future (e.g., project A = 7d, project B = 30d), this decision must be revisited (multi-tenancy and/or more complex retention rules become relevant).

## Multi-Project Separation Model

### Label-based separation (single Loki instance)

- All projects ship to the same Loki instance.
- Projects are separated by a mandatory `project` label.

Rationale:
- Keeps deployment and operations minimal while supporting clean multi-project Explore queries.

## Label Schema (Stream Identity)

The following labels are **allowed** (bounded cardinality) and are part of the stream identity:

- `project` (mandatory)
- `env`
- `service` (or `module`)
- `level`
- `model` — **ML model identifier** used by the project (e.g., LLM model name/version); bounded set
- `function` — **logical operation / task identifier** (business- or application-level, e.g., `transcription`, `embedding`, `ranking`, not raw code symbols; bounded: expected O(10–50))

Constraints:
- Labels must be **low-cardinality and stable**.
- Labels describe **origin/context** (where/what), not request-specific identifiers.

### Explicitly forbidden as labels (must stay in log body)

High-cardinality and request-scoped fields must not be labels:

- `request_id`, `trace_id`, `span_id`
- `user_id`, `device_id`, `session_id`
- any unique per-event IDs

These belong in structured log fields to avoid stream explosion.

## Log Format

- Application logs should be **structured** (JSON preferred).
- Request/trace correlation identifiers live in the **log body**, not labels.

Rationale:
- Structured logs enable filtering and limited aggregation via LogQL pipeline stages without ELK-level complexity.
- Keeping high-cardinality fields out of labels preserves Loki performance characteristics.

## Query & UX Strategy

### Primary workflow

- **Grafana Explore** is the primary UI for the core use case (“show logs for day/hour”).
- Per-project saved Explore queries are allowed (optional), but dashboards are not required.

Rationale:
- The dominant access pattern is interactive time-slice browsing.
- Explore + stable labels (`project`, `env`, `service`, `level`) directly supports this without dashboard maintenance overhead.

## Access & Security

### Selected approach (Cloudflare Tunnel + Access)

- **Cloudflare Tunnel** for transport (origin never exposes inbound public ports).
- **Cloudflare Access** policy in front of Grafana.
- TLS terminated at Cloudflare edge for `grafana.<domain>`.

Rationale:
- Eliminates inbound exposure of Grafana service ports.
- Adds a pre-auth gate at the edge before Grafana is reachable.

### Alternatives considered and rejected (brief)

- **Direct public exposure (firewall + HTTPS):** rejected due to unnecessary attack surface for an admin UI.
- **VPN-only access (e.g., WireGuard/Tailscale):** rejected because Cloudflare Access provides simple pre-auth gating and browser-native access without requiring all clients to be on a VPN.

Note:
- Grafana retains its own authentication/authorization as the second layer.

## Operational Notes

- Single-host stack: backup strategy is host-level (volume snapshots / file backups) if needed.
- Capacity management: retention (14 days) is the primary control knob for disk usage.
- Scaling trigger: consider re-architecture only if ingestion/query latency becomes unacceptable or retention/storage requirements change materially.

## Summary (Decision Statement)

Deploy a **single-host, monolithic Loki** with **Grafana** in Docker and **Alloy as a host service** that ingests a **journald-first** log plane (including Docker containers via journald logging). Enforce a **uniform 14-day retention** for all logs while supporting multi-project separation via a mandatory `project` label. Expose Grafana remotely using **Cloudflare Tunnel** and protect it with **Cloudflare Access**, keeping origin inbound ports closed to the public internet.