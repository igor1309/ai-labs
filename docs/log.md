# Log

## 2026-04-29

- LOC dashboard: classified `img`/`images` as known top-level dirs in `scripts/loc-dashboard.sh` so README banner asset folders no longer trip drift detection.

## 2026-04-28

- Refreshed `docs/loc-dashboard.html` data array to match current `scripts/loc-dashboard.sh` output; regentara now reflects post-MVP code (`952/1712/4585`), and drifted entries for nomos, dev-skills, agents, session-digest, and repo-scripts updated.

## 2026-04-27

- ADR: added `docs/adr/cli-settings-convention.md` — repo-level rule covering discovery precedence, first-run bootstrap, structural-vs-catalog split, and settings-error class for CLI tools. Lists known violations in `regentara` and `session-digest` to close via per-tool plans.
- Nomos: remove inert `nomos-shared` declaration from the repo prod compose (CI never copies it) and the orphan `docker build -t nomos:latest .` from staging deploy. Cleanup of dead promises after the rollback redesign. See `nomos/docs/log.md`.
- Nomos: rewrite rollback path to operate on the actually-used `nomos-nomos:latest` image so a failed prod deploy can restore the previous version. See `nomos/docs/log.md`.
- Nomos: force `--build` on prod compose so deploys rebuild the auto-named prod image instead of caching the previously built version. See `nomos/docs/log.md`.
- Nomos: declare `nomos-shared` external network in the prod compose so Caddy retains staging connectivity across `docker compose down/up`. See `nomos/docs/log.md`.
- regentara: scaffolded as a Node ESM workspace package and release unit; LOC dashboard tests now treat it as an implemented code component instead of docs-only.
- regentara: created MVP workflow runner implementation plan from accepted spec and ADRs; addressed architecture-doc review (test ownership, skill references, release-unit posture, provider-CLI module split, worktree creation step, Node version pin, commit staging scope). See `regentara/docs/log.md`.
- Reverted out-of-scope Nomos release/deploy changes from the session-digest branch and removed the mistaken Nomos release tags.
- session-digest: replaced the Deep Agents prototype role with a V2 local-ledger and bounded-synthesis CLI, including dependency cleanup and component documentation updates.
- Process docs: made implementation plans explicitly declare execution mode, review stops, worktree mode, push policy, and final archiving so future plan execution can auto-continue without ambiguity.

## 2026-04-26

- session-digest: exploration docs complete (ADR-001, CLI spec, Deep Agents/NVIDIA NIM use cases, and TypeScript implementation plan). See `session-digest/docs/log.md`.

## 2026-04-25

- regentara: MVP ADR set complete (agent settings, model routing, CLI execution boundary, failure policy, run artifact storage). All reviewed and accepted. See `regentara/docs/log.md`.

## 2026-04-24

- Notio frontend v0.1.0: dark theme UI, fixed Cloudflare Pages deploy project name.

- AI Labs landing page: product cards for all 14 projects with 2-column grid and scroll/hover animations.

- Release docs: aligned explicit configured basename invariants and README component entries with the Notio backend/frontend release split.

- Release ADRs: clarified explicit configured basenames for nested release units so symmetric component folders can still use globally unambiguous tags.

- LOC dashboard: consolidated oracle into single row, added missing code extensions (.svelte, .sql, .css, .html, .mjs), merged gen/scripts columns into code, renamed text to docs, added per-project .md counting, added nexum/niora/regentara as regular rows, added .wrangler to exclusions.

- CI: narrowed `notio` path filter to Swift-only paths (Sources, Tests, Package.swift, Package.resolved), removing infra paths (supabase, Dockerfile, docker-compose, scripts, release.toml) that don't need the 15-min Swift test suite.

## 2026-04-23

- LOC dashboard: added regentara to known dirs and docs-only list, clearing drift warning.
- regentara: new project — AI orchestrator (governance/routing layer over other agents). Initial docs: naming brief, name pool, orchestration design, and research notes.
- CI: switched `notio` path filter from catch-all `notio/**` to inclusion-only (Sources, Tests, Package.swift, Dockerfile, etc.) so doc-only changes skip the expensive `notio-core` Swift build. Negation patterns don't work — `dorny/paths-filter` OR's all lines.

## 2026-04-21

- dev-skills: made igor1309/skills public for Web Agent plugin access. Added project-level `.claude/settings.json`. Marketplace v1.32.1.
- Removed `paths-ignore` from `ci.yml` — the `report` required check was never created on doc-only PRs, blocking auto-merge. Path filtering now handled entirely by `dorny/paths-filter` inside the workflow.
- agent-retro architecture note: reinstated Open questions section with five architecture-level gaps surfaced during review — digest-engine behavior on uncovered sessions, canonical-session mapping ownership, digest artifact lifecycle, report-writer invocation boundary, and digest window shape vs session-based model. All are structural/contract questions deferred to the follow-up ADR/spec.
- agent-retro architecture note: added a Boundary summary bullet for deep inspection — "a bounded second-pass stage within the digest engine, applied only to promoted sessions and using retained evidence from the index/store" — consolidating the mechanism, scope, input-source, and cost-bound properties decided in prior patches.
- agent-retro architecture note: added "Stable canonical-session identity" key constraint — canonical-session collection, refresh, and coverage all require stable session identity; the exact derivation is deferred to the follow-up ADR/spec.
- agent-retro architecture note: clarified deep inspection as an internal second-pass stage of the digest engine that runs only on promoted sessions and reads from the index/store (never raw sources). Tightened retained-evidence wording to concrete categories (session trajectory, notable retries/failures, tool activity, supporting excerpts) with full raw retention not required. Added a bounded deep-inspection cost constraint (configurable limits on promoted sessions inspected per run and evidence per session). Removed the remaining open question, and with it the Open questions section.
- agent-retro architecture note: shifted coverage from timeframe-shaped to session-shaped. Coverage metadata is now tracked per canonical session (source id, canonical session identity, collection outcome, collected at, collection mode, collector/schema version); requested timeframes retained only as run/request metadata. Planner wording now explicitly separates timeframe (selection input) from coverage (per-canonical-session truth). Resolved the open question on coverage representation.

## 2026-04-20

- Added `.github/workflows/` README.md and CLAUDE.md (with AGENTS.md symlink) documenting CI architecture, agent rules, and paths-ignore policy.
- CI now skips `**/sandbox/**` and `**/research/**` at any nesting level (previously top-level `sandbox/` only, `research/` missing).
- Repo-root `AGENTS.md` is now a symlink to `CLAUDE.md` (was the reverse). Convention documented in README.

## 2026-04-19

- notio: two-phase capture feedback (`notio_v0.3.0`) — receipt acknowledgement and final outcome messages via Telegram. 144 tests, Docker verified.

- notio: deployed `notio_v0.2.0` — full capture pipeline (parse → enrich → persist to Supabase) live on VPS. Fixed deploy ssh timeout and added `paths-ignore` to CI `pull_request` trigger to skip builds on docs-only PRs.

- LOC dashboard: clarified that the report is implementation-footprint-only, surfaced omitted docs-only/pre-implementation dirs (`nexum`, `niora`) in output, and fixed repo-level test counting to include `scripts/tests`.

- absorb-ai-coder: absorbed the remaining reusable content from `ai-coder/README.md` into the root `README.md` and `dev-skills/README.md`, then removed the obsolete `ai-coder/README.md` file.

- absorb-ai-coder: absorbed the old `ai-coder/AGENTS.md` structure and publishing facts into the root `README.md`, then removed `ai-coder/AGENTS.md` and its paired `ai-coder/CLAUDE.md` symlink now that those repo-orientation notes live at the monorepo root.

- absorb-ai-coder: moved `ai-coder/docs/` into `dev-skills/docs/` by promoting the ai-coder log and archived dev-skills migration docs into the dev-skills documentation area. Updated the active absorption plan so it reflects the follow-up moves already completed on this branch.

- absorb-ai-coder: promoted `ai-coder/gemini/` to root `gemini/` and fixed the CI drift this created by adding `gemini/**` to `ci.yml` `paths-ignore`. No active workflows reference `ai-coder/gemini` or root `gemini/`.

- absorb-ai-coder: promoted `ai-coder/tools/` to root `tools/` and fixed the CI drift this created by adding `tools/**` to `ci.yml` `paths-ignore`. No active workflows reference `ai-coder/tools` or root `tools/`.

- absorb-ai-coder: promoted `ai-coder/sandbox/` to root `sandbox/` and fixed the CI drift this created by adding `sandbox/**` to `ci.yml` `paths-ignore`. The repo-wide `sandbox-todo-issues.yml` remains intentionally active for root `sandbox/` entries.

- absorb-ai-coder: promoted `ai-coder/dev-skills/` to root `dev-skills/` and fixed the workflow drift this created by switching `sync-skills-public.yml` from `ai-coder/dev-skills/public/**` to `dev-skills/public/**` and adding `dev-skills/**` back to `ci.yml` `paths-ignore`.

- absorb-ai-coder: promoted `ai-coder/guides/` to `migrate-to-skills/guides/` and fixed the workflow drift that surfaced from the new root destination by adding `migrate-to-skills/**` to `ci.yml` `paths-ignore`. No active workflows reference `ai-coder/guides` or `migrate-to-skills/guides`.

- absorb-ai-coder: promoted `ai-coder/prompts/` to root `prompts/`. Workflow audit for this step found no path drift: no active workflows reference `ai-coder/prompts`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: promoted `ai-coder/debates/` to root `debates/`. Workflow audit for this step found no path drift: no active workflows reference `ai-coder/debates`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: promoted `ai-coder/reading/` to root `reading/`. Workflow audit for this step found no path drift: no active workflows reference `ai-coder/reading`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: promoted `ai-coder/insights/` to root `insights/`. Workflow audit for this step found no path drift: no workflows reference `ai-coder/insights`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: moved the imported `_inbox/` from `ai-coder/_inbox/` to repo root and fixed the workflow drift that surfaced on this branch by adding `_inbox/**` to `ci.yml` `paths-ignore`; `sync-skills-public.yml` still correctly targets `ai-coder/dev-skills/public/**`, and `sandbox-todo-issues.yml` remains intentionally repo-wide.

- absorb-ai-coder: imported `~/dev/ai-coder` into ai-labs under `ai-coder/` with full tracked history preserved, keeping repo-level assets intact and separating any later restructuring into follow-up work.

- LOC dashboard: added neris (Swift), notio (Swift), claude-insights (TS/Python); extended counting to .swift/.py; fixed agents text count (removed dead .codex ref, added per-project AGENTS.md, skills, my-way docs); added drift detection for new top-level dirs; wired drift warning into CI workflow.

- my-way: clarify the pre-coding phase as judgment-driven and iterative; extract first-class skills for research, pre-ADR, ADR, spec, and implementation planning; add transition tracking, promotion checklist, and future-shape note so the approach can move toward skills without forcing a premature final information architecture.

## 2026-04-18

- Added `notio-core.yml` CI workflow and wired it into `ci.yml` path-filter dispatch — notio tests now run on PRs in a `swift:6.1` Linux container, catching platform-specific failures before merge.

- Split shared `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` CI secrets into per-project `NOMOS_VPS_*` and `NOTIO_VPS_*` in `release-unit.yml` — nomos deploys to 95.164.53.144, notio deploys to 107.172.143.196.

## 2026-04-06

nexum: reviewed and fixed

## 2026-04-05

nexum: complete architecture doc set — pre-ADR spec, frontend ADR (v0.2.0), backend ADR (v0.3.0), OpenAPI contract (v1.4.0), frontend auth ADR, backend auth ADR, architecture review amendments, supersession note, component architecture approach, and naming brief.

## 2026-03-29

claude-insights: add `claude-insights-deploy.yml` — trunk-only CI workflow that detects changed Supabase Edge Functions (`notify-insights`, `telegram-bot`) and deploys only those affected; `_shared/**` changes trigger both. Issue #110.

claude-insights: `/compare` now accepts an optional week count (`/compare 3`), defaults to 2 weeks; narrative trim scales inversely with snapshot count (more chars per row for fewer rows). Issue #109.

claude-insights: fixed a cluster of reliability issues — Supabase keep-alive now works end-to-end from the weekly LaunchAgent (wrong CLI flag, SSL crash, and non-fatal refresh); `/compare` no longer 413s (payload trimmed to LLM-relevant fields + capped narrative). PRs #103–108.

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
