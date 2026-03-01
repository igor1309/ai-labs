---
date: 2026-02-28
model: claude-opus-4-6
description: "Major Nomos milestones extracted from repo logs"
---

# Milestones

## 2026-02-26 — Foundation (v0.1–v0.5)

1. **Phase 1 – Project scaffold + deployable skeleton** — initial service structure, wired as npm workspace
2. **Phase 2 – Runner abstraction** — StubRunner with deterministic fixtures
3. **Phase 3 – Auth & project identity** — bearer token validation, scope enforcement
4. **Phase 4 – Unified API proxy + SSE streaming** — OpenAI-compatible `/v1/chat/completions`, Runner protocol
5. **Phase 5 – Cost control & budget enforcement** — usage logging, budget checks, `GET /v1/usage` endpoint
6. **Phase 6 – Prompt safeguards** — input sanitization, injection pattern detection, system prompt reinforcement

## 2026-02-27 — Production deployment (v0.6)

7. **Production VPS deployment** — Docker Compose + Caddy TLS + SQLite stack
8. **E2E local deploy test** — `docker-compose.e2e.yml`
9. **CI/CD deploy pipeline (ADR-0002)** — release-unit workflow deploys to VPS via SSH
10. **Deploy smoke checks** — `/health` endpoint version verification, real LLM smoke test via `OPENROUTER_CI_MODEL`
11. **Telegram deploy notifications** — version and model info on success
12. **Oracle wired through Nomos** — Oracle LLM calls routed through the proxy

## 2026-02-28 — Staging & operational maturity (v0.8)

13. **Staging environment (ADR-0003)** — `docker-compose.staging.yml`, `.env.staging` template, VPS deployment guide
14. **Staging → prod promotion pipeline** — split CI deploy into two stages with dedicated smoke token
15. **Deploy scripts extraction** — inline scripts moved to `nomos/scripts/`
16. **Automatic rollback** — failed prod deploys trigger rollback
17. **v0.8.3** — current version, hardened deploy pipeline
