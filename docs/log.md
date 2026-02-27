# Log

## 2026-02-27
Nomos: add deploy smoke checks (version in /health, real LLM call). See `nomos/docs/log.md`.
Nomos: add CI/CD deploy pipeline via SSH (ADR-0002). See `nomos/docs/log.md`.
Nomos: deploy to production VPS (nomos.enoa.ai), fix deployment guide with lessons learned. See `nomos/docs/log.md`.
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
