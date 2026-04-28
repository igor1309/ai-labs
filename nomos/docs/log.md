# Log

## 2026-04-27

Drop the inert `nomos-shared` declaration from the repo prod compose and remove the orphan `docker build -t nomos:latest .` from `deploy-staging.sh`. CI does not copy `docker-compose.yml` to the VPS, so the repo declaration was a false promise of network membership the deploy pipeline never delivered. The `nomos:latest` image was likewise built and never used now that scripts operate on `nomos-nomos:latest`. The on-VPS prod compose retains its operator-managed `nomos-shared` attachment unchanged.
Fix rollback by snapshotting and restoring the actual prod compose image (`nomos-nomos:latest`) instead of the orphan `nomos:latest` tag the prod stack never used. Without this, `rollback-prod.sh` was a no-op — every "Rollback successful" message in CI logs was misleading.
Force `--build` on prod compose so each deploy actually rebuilds the auto-named `nomos-nomos:latest` image. The `nomos:latest` tag the deploy/rollback scripts shuffled was orphan; prod compose uses `nomos-nomos:latest` and was caching at v0.8.6 across every deploy from v0.8.7 onward, masking the real release version. Staging works for the same reason in reverse — its script already passes `--build`.
v0.8.9: redeploy Nomos with the staging-route compose repair so the staging-gated release pipeline can complete after the v0.8.8 502 outage.
Repair Nomos staging route: declare `nomos-shared` external network in the prod compose so Caddy stays attached after a `docker compose down/up`. Without this, an earlier deploy that overwrote `/opt/nomos/docker-compose.yml` recreated `nomos-caddy` without `nomos-shared`, and every `staging.nomos.enoa.ai/*` request returned 502.
v0.8.8: publish the existing Nomos payload-limit and oversized-request improvements as the next deployable release.
Add intentional Nomos JSON body-size configuration via `NOMOS_JSON_BODY_LIMIT`, with a 1MB default, validation, docs, and staging-first operator guidance.
Implement Nomos-owned oversized JSON request rejection: 413 responses now report local rejection plus the effective parser limit.
Add issue ticket for intentional JSON payload-size configuration, including tests, docs, and staging-gate requirements.
Add issue ticket for improving oversized JSON request errors so Nomos reports local 413 body-limit failures explicitly.

## 2026-03-09
v0.8.4: add compose-level healthcheck to staging stack, replace deploy script sleep+wget race with --wait flag. Fix release-unit core job (install ripgrep for corpus-scout tests). Fix deploy-prod cleanup deleting notify script before notification step runs.

## 2026-02-28
v0.8.3: extract deploy scripts to `nomos/scripts/`, add automatic rollback on failed prod deploy, fix github-release gating when staging fails.
Implement staging environment (ADR-0003): add docker-compose.staging.yml (isolated project, container, volume, port 8081, external network), .env.staging.example template, VPS deployment guide staging section (DNS, Caddyfile, env setup, smoke-test project registration), split deploy-nomos CI job into deploy-nomos-staging → deploy-nomos-prod promotion pipeline with dedicated staging smoke token.

## 2026-02-27
Add Telegram success notification on deploy with version, model, and LLM response.
Add deploy smoke checks: /health returns version, post-deploy version verification, real LLM smoke test via OPENROUTER_CI_MODEL (openai/gpt-5-nano) with dedicated smoke project token.
Add CI/CD deploy pipeline (ADR-0002): release-unit workflow deploys to VPS via SSH on nomos_v* tag push — scp source files, rebuild Docker image, restart stack, health check. GitHub secrets VPS_HOST/VPS_USER/VPS_SSH_KEY configured.
Deploy Nomos to production VPS (<NOMOS_DOMAIN>): Docker Compose + Caddy TLS + SQLite stack live on <VPS_IP>, oracle project registered, automated backups and log rotation configured. Fix deployment guide: add container UID note for root deploys, DNS verification gate before stack start, log rotation timing warning.
Add VPS deployment guide (docs/vps-deployment-guide.md): step-by-step instructions covering Docker install, firewall, Caddy TLS, .env configuration, image build/pull, project registration, budget setup, backup automation, log rotation, updates/rollbacks, and incident triage.
Add self-contained e2e local deploy test (docker-compose.e2e.yml + e2e-local-deploy.test.js): isolated stack on port 8180 with own container names/volumes, auto-seeds stub project into DB, validates health through Caddy, auth enforcement, non-streaming and streaming stub completions, 404 handling, and bad-request errors. 8 e2e tests, gated by RUN_NOMOS_E2E=1.
Fix all review WARNs: path traversal guard in StubRunner, redactContent boundary fix (slice(-0) bug), extract fakeRunner/fakeRunnerWithUsage to shared helpers, unify cleanupTestDb() across test files, fix time-sensitive budget tests (fixed dates), fix object identity assertion in safeguards test, add cross-project usage isolation test, tighten e2e SSE assertion, add streaming usage tracking comment. Archive reviews 0001 and 0003.
Fix test review findings: replace tautological hashToken test with hardcoded digest, add malformed JSON body test, add missing Content-Type test, add LiveRunner timeout tests (execute + stream). 142 tests, 0 fail.
Close V0 completion review findings: add safeguards env vars to .env.example, update plan status to implemented and move to plans/implemented/, add repo-level log entry, fix misleading stub-runner test, extract shared test helpers.

## 2026-02-26
Implement Phase 6: prompt safeguards — best-effort input sanitization (null bytes, zero-width chars, RTL overrides), regex-based injection pattern detection (8 default patterns: ignore-previous, disregard-instructions, new-instructions, you-are-now, system-prompt-leak, jailbreak-prefix, role-override, prompt-injection-marker), optional system prompt reinforcement (prepend/append safety text), suspicious payload logging with redacted content for audit, per-safeguard enable/disable config via env vars, configurable blocking mode. Safeguards protocol owned by chat-completions handler, wired through app/server. 41 new tests (32 unit + 9 integration).
Implement Phase 5: cost control & budget enforcement — usage_log and budgets SQLite schemas, post-completion token usage logging (non-streaming and streaming), pre-request budget check with 429 hard stop, daily/monthly period reset, GET /v1/usage report endpoint with per-model breakdown, budget service wired into chat-completions handler and server. 35 new tests (7 schema + 16 budget unit + 12 integration).
Implement Phase 4: unified API proxy + SSE streaming — Runner protocol owned by route handler, OpenAI-compatible POST /v1/chat/completions with request validation, SSE streaming passthrough (data: JSON + data: [DONE] framing), LiveRunner for real vendor HTTP calls (configurable base_url/timeout_ms/headers), runner dispatch by namespace (/v1/*→LiveRunner, /stub/v1/*→StubRunner), stub API gated by NOMOS_STUB_ENABLED (404 when disabled), E2E SSE test through Docker/Caddy, 28 new tests (27 unit/integration + 1 e2e).
Implement Phase 3: auth & project identity — projects table schema with scope check constraint, SHA-256 bearer token validation middleware, scope enforcement (live→/v1/*, stub→/stub/v1/*), token redaction in logs, 14 new tests covering schema, valid/invalid tokens, inactive projects, scope mismatches, and redaction.
Implement Phase 2: runner abstraction — StubRunner with deterministic JSON fixtures and scripted SSE streams (chunk/error/end events), fixture loading from filesystem, 9 new tests covering fixture loading, event ordering, stream termination, and error scenarios. Runner protocol deferred to Phase 4 (no protocol without a client).
Implement Phase 1: project scaffold + deployable skeleton (Express app, health endpoint, SQLite WAL, structured JSON logging, Dockerfile, docker-compose.yml + Caddy, .env template, unit tests, e2e smoke test, CI pipeline wiring).
Add Nomos V0 implementation plan (6 phases: scaffold+runner, auth, API+SSE, cost control, safeguards, deployment).
Add Nomos seed docs created with gpt-5.2.
