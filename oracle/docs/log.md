# Log

## 2026-02-22
- Refactor GitHub Actions workflows: CI/Web E2E now delegate to reusable core workflows and share a Telegram failure notification script.
- Create Cloudflare Pages project `am-i-done-web`, set Pages `API_BASE_URL` secret to Worker origin (`am-i-done-api.igor1309.workers.dev`), deploy web frontend, and pass deployed smoke checks (`GET /` and `POST /api/outlook` return `200`).
- Implement prod-only, text-free Workers Analytics Engine telemetry (v1 `api_request` + `llm_call`) with per-request `requestId` correlation (blob, not indexed), best-effort `ctx.waitUntil` emission, and coverage/docs updates.
- Automate local web-to-worker wiring and configuration defaults: `npm run web:dev` now binds `API_BASE_URL` to local worker by default, frontend request timeout default is increased to `12000ms` with explicit tests, and worker model selection moved to required vars (`NORMALIZER_MODEL`, `OUTLOOK_MODEL`) configured to `openai/gpt-5-nano`.
- Implement web frontend v1 plan `0007`: refactor app state/effect/render units, add frontend request-contract tests, polish web UI presentation, and add Pages deployment runbook with required `API_BASE_URL` and worker-before-web ordering.
- Add implementation plan `0007-web-frontend-v1-implementation.md` with explicit architecture conformance checks and step-by-step delivery gates for polished web UI and same-origin Pages routing.
- Add `oracle/README.md` deployment runbook documenting Cloudflare Worker (`am-i-done-api`) deployment, Cloudflare Pages frontend deployment, explicit prerequisites for required Worker bindings/secrets, and same-origin `/api/*` route wiring required by the web app.
- Add local secret-file hygiene for Worker development: `oracle/apps/am-i-done-api/.dev.vars.example` template plus app-local `.gitignore` rules for `.dev.vars`/`.env` files.
- Add repo-level `.gitignore` protection for `.env`/`.dev.vars` files so local secrets remain untracked across all projects.

## 2026-02-21
- Add Cloudflare Pages deployment wiring for `am-i-done-web`: add Pages `wrangler.toml`, same-origin `/api/*` Pages Function proxy via `API_BASE_URL`, deploy/dev npm scripts, and proxy unit tests.
- Lock frontend v1 foundation decisions in docs: vanilla TypeScript UI, same-origin `/api/outlook` routing, and locale policy (`en-US` for v1, auto-detect with `en-US` fallback planned for v2).
- Implement web E2E coverage: add `am-i-done-web` UI (happy/clarification/transport-failure states), deterministic Worker model-stub mode for CI-safe browser tests, and move plan `0006-add-web-e2e-once-ui-exists.md` to implemented.
- Complete deploy verification for `am-i-done-api`: run full tests, deploy Worker successfully, and pass smoke checks (`GET /health` returns `200 ok`; `POST /api/outlook` returns structured JSON for valid input and clarification payload for invalid input) after correcting the `OPENROUTER_API_KEY` secret binding name.
- Add assembler-level `makeWorkerFetch` contract tests for router delegation (`/health`, unknown path, `/api/outlook`) plus default OpenRouter config propagation (blank model bindings and invalid timeout fallback).
- Harden popularity tracker error tagging for frozen/non-extensible thrown values and keep composition fail-open behavior restricted to tagged counter-write failures with reporter/no-reporter coverage.
- Make popularity tracking fail-open in worker composition so D1 counter write errors (including missing `raw_input_counters` migration) do not break `/api/outlook` responses.
- Implement `PopularityTracker` in `worker-api` and wire it in the assembler so counters are tracked on every guard-valid request (canonical and clarification paths), independent of outlook cache hit/miss.
- Add `raw_input_counters` D1 migration and `createRawInputCountersStore` adapter/tests for request-level raw profession counting.
- Move final Worker `makeWorkerFetch(env)` assembly from `worker-api` package into `am-i-done-api` app source so env-to-adapter wiring is anchored at the Worker entrypoint while `worker-api` stays wiring/router focused.
- Correct the implementation inventory to explicitly flag missing `PopularityTracker` architecture behavior (counters on every request) and mark the assemble checklist accordingly.
- Add an implementation inventory for worker assembly covering module/adapter contracts, wiring points, binding requirements, test coverage, and spec drift notes in one operator-facing reference.
- Harden `worker-api` request guard property reads to handle hostile getter-based inputs without throwing, with explicit non-throwing tests for throwing getters.
- Implement `worker-api` request guard with strict validation for `profession`, `locale`, and `schemaVersion` resolution plus non-throwing behavior tests.
- Add explicit popularity counters adapter test for trimmed-empty profession rejection while preserving upsert and bound-parameter checks.
- Route assembled Worker fetch through `createWorkerApiEntrypointRouter` so entrypoint routing is owned by `worker-api` while preserving assembler wiring.
- Fail fast in `worker-api` router wiring when `outlookHandler` is missing or not a function, and cover it with dedicated router dependency-validation tests.
- Implement worker entrypoint router in `worker-api` (`GET /health`, `POST /api/outlook`, default `404`) and wire Worker `fetch` to delegate `/api/outlook` through composed `createWorkerFetchHandler`.
- Harden worker API wiring: restrict `/api/outlook` to POST, reject empty `OPENROUTER_API_KEY`, and enforce OpenRouter timeouts via `AbortController` in both model adapters.
- Implement worker API assembly: request guard, KV cache adapter, OpenRouter model adapters, D1 popularity store, and `makeWorkerFetch(env)` routing wired into the Cloudflare entrypoint.
- Add Cloudflare KV JSON cache adapter with fail-fast dependency validation (`kv`, `kv.get`, `kv.put`) and adapter tests for miss/hit/invalid-JSON/write behavior.
- Add GitHub Actions CI workflow to run the full test suite on push and pull requests via `scripts/run_silent.sh`.
Provision and deploy Cloudflare Worker service (`am-i-done-api`) with KV caches, D1 database, and initial migrations.
Add Worker scaffold (`wrangler.toml`, `/health`, structured `/api/outlook` stub) and local `wrangler` tooling/scripts.
Implement interface-only `worker-api` composition wiring with validated dependency contracts, structured clarification handling (including invalid JSON), and documented assembly/testing rules.
Add `oracle` seed doc.
