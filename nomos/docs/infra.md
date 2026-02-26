---
date: 2026-02-26
model: gpt-5.2
source: https://chatgpt.com/share/69a04dee-78a4-8003-8d39-553a25372c4f
---

# Nomos — Infrastructure Decisions (V0)

Date: 2026-02-26  
Status: Accepted  
Scope: V0 / Solo VPS deployment  
Related: ADR-0001 (VPS-first deployment)

---

## 1. Deployment Topology

Nomos runs as a single service on a VPS behind a reverse proxy.

Traffic:
Client → Reverse Proxy (TLS) → Nomos API → LLM Vendor APIs

Nomos is designed to be stateless where practical. Persistent governance state is stored locally (see §4).

---

## 2. Streaming (Day 0)

Nomos MUST support streaming responses from day 0.

- Protocol: **Server-Sent Events (SSE)**
- Reverse proxy configuration MUST support streaming (no buffering).
- Nomos MUST propagate vendor streaming to clients with minimal transformation.

---

## 3. Reverse Proxy / TLS

- TLS termination: **Caddy**
- Responsibilities:
  - HTTPS termination
  - Reverse proxy to Nomos
  - Basic rate limiting (where supported/appropriate)
  - Access logs (optional)

Rationale: simple, low-maintenance TLS for a solo VPS deployment.

---

## 4. Persistence

- Primary store: **SQLite**
- Mode: **WAL enabled**
- Storage contains:
  - Project tokens / auth metadata (minimal)
  - Budgets and accounting checkpoints
  - Audit/event records (minimal, redacted)

Rationale: lowest operational overhead while providing durability.

---

## 5. Process Supervision / Runtime

- Deployment mechanism: **Docker Compose**
- Restart policy: `unless-stopped`
- Nomos container should be replaceable via pull + restart as part of the release train.

---

## 6. Configuration & Secrets

- Configuration via environment (`.env`) and Compose variables.
- Secrets stored on VPS filesystem with strict permissions.
- No vault dependency in V0.

Operational requirements:
- Secrets MUST be rotatable.
- Do not commit `.env` to git.

---

## 7. Authentication

- Client authentication: **static bearer tokens per project**
- Tokens are:
  - Unique per project
  - Rotatable
  - Logged only in hashed/partial form (never raw)

---

## 8. Logging & Observability

- Nomos logs structured **JSON** to stdout.
- Host-level log rotation is configured.
- Retention window is explicitly configured (default: short).
- Redaction rules MUST exist for:
  - Authorization headers
  - Known secret fields
  - Common PII markers (best-effort)

Optional (later): Prometheus metrics endpoint.

---

## 9. Rate Limiting

Baseline:
- Proxy-level basic rate limits (coarse)
- App-level enforcement via:
  - budget gates
  - per-token request limits (if needed)

---

## 10. Backups

- Nightly backup of:
  - SQLite database file
  - Deployment configuration (Compose + Caddy config + `.env` snapshot)
- Backups stored off-container on the VPS, with optional off-VPS copy later.

---

## 11. Release Train

Nomos follows a simple release train suitable for solo maintenance:

- Versioned releases (tags)
- Deploy: pull image / update artifact → restart service
- Rollback: revert to previous tagged release and restart

---

## 12. Explicit Trade-offs

- VPS-first introduces additional latency (extra hop).
- This is accepted for cost and availability reasons.
- Streaming is mandatory to improve perceived latency.