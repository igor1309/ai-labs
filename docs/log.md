# Log

## 2026-03-29

claude-insights: add `claude-insights-deploy.yml` — trunk-only CI workflow that detects changed Supabase Edge Functions (`notify-insights`, `telegram-bot`) and deploys only those affected; `_shared/**` changes trigger both. Issue #110.

claude-insights: `/compare` now accepts an optional week count (`/compare 3`), defaults to 2 weeks; narrative trim scales inversely with snapshot count (more chars per row for fewer rows). Issue #109.

claude-insights: fixed a cluster of reliability issues — Supabase keep-alive now works end-to-end from the weekly LaunchAgent (wrong CLI flag, SSL crash, and non-fatal refresh); `/compare` no longer 413s (payload trimmed to LLM-relevant fields + capped narrative). PRs #103–108.

## 2026-03-25

neris: promote session loop PoC types (REPL, Gate, Router, StateEnvelope, AgentLoop/ControllableAgentLoop protocols) to production. Add REPL.cli factory with FilterResult-based input filtering. Rename AgentLoop actor to ToolUseLoop. Replace Loop with REPL in CLI. Organize Sources/Core into Session/ subdirectory.

## 2026-03-14

claude-insights: add `/compare` bot command — LLM-powered week-over-week trend analysis via Nomos. New `_shared/llm.ts` helper, Nomos project registered, secrets set, function deployed. Add Nomos key isolation rule to AGENTS.md. PR #96.

## 2026-03-04

corpus-scout: improve test coverage per testing doc — add must_contain, no-extra-files, and ripgrep precondition assertions. Document ripgrep dependency in CI workflow.
corpus-scout: add determinism eval runner (ADR-0002) with adapter, eval engine (ESM/NCFB/MUST gates), reporter, synthetic Russian humanities corpus (12 files), and gold dataset (30 cases). Zero run-to-run drift across consecutive runs. PR #80 merged.

## 2026-03-03

Add `corpus-scout` — reusable MCP server for lexical search and section reading over any local text corpus via ripgrep. Two tools (`search`, `read_section`), configurable via env vars, dedicated CI workflow. Implements ADR-0001 file-first retrieval. PR #76 merged.

promote langfuse stack from `web-scout/docker/langfuse/` to shared `docker/langfuse/`; all projects can now share a single local instance
web-scout: add `mcp-search` child span to Langfuse smoke tracing (PR #73); complete Langfuse v3 observability for rules 5 and 11; rule 6 (LLM token/cost) documented as blocked by CrewAI OTel provider conflict. All 21 unit tests pass. See `web-scout/docs/log.md`.
web-scout: migrate smoke script to Python + CrewAI + nomos and get first passing run. Fixes: malformed MCP tool schema causing OpenRouter 502s, LiteLLM model routing through custom base_url, Python venv setup. See `web-scout/docs/log.md`.

## 2026-03-02

web-scout: add structured JSON logging to stderr (startup + per-call), `LOG_LEVEL` env var, and updated README. See `web-scout/docs/log.md`.
Add web-scout CI workflow (`web-scout-core.yml`) and path-filter dispatch in `ci.yml`.

## 2026-03-01
Replace inline Telegram curl in `release-unit.yml` deploy notification with shared `ci-shared/scripts/notify_telegram.sh` (fixes #62, #61). Transport script is copied to VPS via existing scp step.
Extract Telegram transport to `ci-shared` (PR #64 merged): shared `notify_telegram.sh` with ADR-001 curl flags, local adapter in `scripts/ci/`.

## 2026-02-28
Remove Loki from CI: delete `loki-core.yml`, remove from `ci.yml` dispatch and notify, remove from `npm test` glob. Loki code and tests stay in repo.
Relax ADR-003 basename reuse invariant from MUST NOT to SHOULD NOT (enforcement deferred).
Fix AGENTS.md: clarify `release-unit.yml` is post-tag pipeline; detection and tagging are operator scripts.
Amend ADR-006 and AGENTS.md: mark Docker registry publishing as deferred, VPS-local tagging is current behavior.
Remove non-functional historical basename reuse check from `validate-manifest.js`.
Add release script tests to CI `release-validation` job.
Fix `github-release` condition: block when Nomos staging deploy fails.
Extract inline deploy scripts to `nomos/scripts/` (staging, prod, rollback) and call from `release-unit.yml`.
Add automatic rollback to prod deploy: tag previous image as `nomos:rollback`, restore on failure.
Unify `release.yml` notification: replace inline Telegram logic with reusable `notify-telegram-failure.yml`.
Add daily scheduled health check (`scheduled-health.yml`): Nomos staging/prod health endpoints + LLM smoke test, Telegram notification on failure.
Close release ADR review (review-2): all findings resolved, ADR-003 Decision Stability upgraded to pass.
Oracle: wire LLM calls through Nomos proxy. See `oracle/docs/log.md`.

## 2026-02-27
Nomos: add Telegram deploy success notification. See `nomos/docs/log.md`.
Nomos: add deploy smoke checks (version in /health, real LLM call). See `nomos/docs/log.md`.
Nomos: add CI/CD deploy pipeline via SSH (ADR-0002). See `nomos/docs/log.md`.
Nomos: deploy to production VPS (<NOMOS_DOMAIN>), fix deployment guide with lessons learned. See `nomos/docs/log.md`.
Update AGENTS.md (Release Process section) and README.md to reflect new per-unit release model (ADR-000–006), add ADR Governance section to AGENTS.md.
Implement release architecture (ADR-000–006): config-driven unit discovery (`release-units.config.toml`), committed manifest (`release-units.toml`), tag-based detection, per-unit `<basename>_v<version>` tagging, Docker image tagging (version + SHA), trunk enforcement, CI manifest drift check, new `release-unit.yml` workflow, legacy `v*` workflow documented as coexistence boundary. 51 release tests passing.
Create release architecture implementation plan (ADR-000–006): 5-phase invariant-driven plan covering unit discovery, release detection, tag creation, Docker image tagging, and end-to-end lifecycle validation.
Review release ADRs (000–006): pass with 4 warns (nested basename derivation, underscore separator ambiguity, first-release edge case, Docker applicability scope).
Wire nomos as npm workspace; remove redundant `cd nomos && npm ci` from CI workflows.
Nomos: complete V0 implementation (Phases 2-6) — runner abstraction, auth & project identity, unified API proxy with SSE streaming, cost control & budget enforcement, prompt safeguards. 130 tests, all passing. See `nomos/docs/log.md`.

## 2026-02-26
Release `v0.2.0`.
Nomos: implement Phase 1 scaffold — Express + SQLite + Caddy skeleton with health endpoint, unit tests, e2e smoke test, Docker deployment files, and CI pipeline wiring. See `nomos/docs/log.md`.

## 2026-02-23
Fix `Release` workflow startup failures by simplifying tag resolution and reusable-workflow wiring.
Release `v0.1.5`.
Put Loki rollout on hold for Oracle observability and keep Oracle on Workers-native logging/telemetry for the current phase.
Extract Oracle core CI into `oracle-core`, dispatch by changed project paths, and gate `real-provider-smoke` on Oracle/shared changes.
Oracle: implement locale v2 (backend + frontend). See `oracle/docs/log.md`.
Add Loki logging stack decision + implementation plan docs (single-host Loki+Grafana, host Alloy journald-first ingestion, 14-day retention, Cloudflare Tunnel + Access).
Release `v0.1.4`.
Stop uploading custom GitHub Release assets (GitHub always includes source archives).
Release `v0.1.3`.
Create minimal GitHub Releases for successful `v*` tag-driven deployments.
Harden tag-driven release workflow (verify tag on trunk/checkout, centralize node version, and reuse Telegram notify wiring).
Switch CI real-provider smoke model to `openai/gpt-5-nano` via Actions variable `OPENROUTER_CI_MODEL`.

## 2026-02-22
Add Telegram notifications on CI failure to both CI and Web E2E workflows using `CI_BOT_TOKEN`/`CI_CHAT_ID` secrets.
Oracle: document local-dev automation and config defaults. See `oracle/docs/log.md`.
Add repo-wide `.env`/`.dev.vars` gitignore protection so local secret files stay untracked by default.

## 2026-02-21
Add Playwright-based web E2E test wiring to CI (browser install + `RUN_WEB_E2E=1` test execution) while keeping local suite runs deterministic.
Add `oracle` project with `seed.md` doc.
Create `ia-labs` repo (name by gpt-5.2).
