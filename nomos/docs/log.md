# Log

## 2026-02-26
Implement Phase 4: unified API proxy + SSE streaming — Runner protocol owned by route handler, OpenAI-compatible POST /v1/chat/completions with request validation, SSE streaming passthrough (data: JSON + data: [DONE] framing), LiveRunner for real vendor HTTP calls (configurable base_url/timeout_ms/headers), runner dispatch by namespace (/v1/*→LiveRunner, /stub/v1/*→StubRunner), stub API gated by NOMOS_STUB_ENABLED (404 when disabled), E2E SSE test through Docker/Caddy, 27 new tests.
Implement Phase 3: auth & project identity — projects table schema with scope check constraint, SHA-256 bearer token validation middleware, scope enforcement (live→/v1/*, stub→/stub/v1/*), token redaction in logs, 14 new tests covering schema, valid/invalid tokens, inactive projects, scope mismatches, and redaction.
Implement Phase 2: runner abstraction — StubRunner with deterministic JSON fixtures and scripted SSE streams (chunk/error/end events), fixture loading from filesystem, 9 new tests covering fixture loading, event ordering, stream termination, and error scenarios. Runner protocol deferred to Phase 4 (no protocol without a client).
Implement Phase 1: project scaffold + deployable skeleton (Express app, health endpoint, SQLite WAL, structured JSON logging, Dockerfile, docker-compose.yml + Caddy, .env template, unit tests, e2e smoke test, CI pipeline wiring).
Add Nomos V0 implementation plan (6 phases: scaffold+runner, auth, API+SSE, cost control, safeguards, deployment).
Add Nomos seed docs created with gpt-5.2.