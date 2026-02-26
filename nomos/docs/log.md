# Log

## 2026-02-26
Implement Phase 3: auth & project identity — projects table schema with scope check constraint, SHA-256 bearer token validation middleware, scope enforcement (live→/v1/*, stub→/stub/v1/*), token redaction in logs, 14 new tests covering schema, valid/invalid tokens, inactive projects, scope mismatches, and redaction.
Implement Phase 2: runner abstraction — StubRunner with deterministic JSON fixtures and scripted SSE streams (chunk/error/end events), fixture loading from filesystem, 9 new tests covering fixture loading, event ordering, stream termination, and error scenarios. Runner protocol deferred to Phase 4 (no protocol without a client).
Implement Phase 1: project scaffold + deployable skeleton (Express app, health endpoint, SQLite WAL, structured JSON logging, Dockerfile, docker-compose.yml + Caddy, .env template, unit tests, e2e smoke test, CI pipeline wiring).
Add Nomos V0 implementation plan (6 phases: scaffold+runner, auth, API+SSE, cost control, safeguards, deployment).
Add Nomos seed docs created with gpt-5.2.