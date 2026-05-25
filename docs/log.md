# Log

## 2026-05-25

- loc-dashboard drift: extended `check_project_drift` in `scripts/loc-dashboard.sh` with reverse drift detection — flags entries in the `known` list that no longer have a directory on disk. Catches the same class of stale-entry bug a human reviewer found in PR #405. Dotfile entries and known-transient dirs (`node_modules`, `vendor`, `worktrees`, `_inbox`) are skipped. The synthetic `agents` aggregate row is now self-documenting via a one-line comment. Two new tests cover the clean-trunk and missing-dir cases.

## 2026-05-24

- dev-skills: added Codex plugin manifest at `dev-skills/public/.codex-plugin/plugin.json` so dev-skills publishes as a Codex plugin in addition to the Claude Code marketplace. CI now guards version parity between `marketplace.json` and `plugin.json` in the `dev-skills-validation` job to prevent silent drift.

## 2026-05-23

- mac-health: bug fix after first live install — `check-disk.sh` was querying `df /` and reporting `status=ok / free_pct=48` on a Catalina+ machine that was actually at 1.2% free. Root cause: APFS shares space across a read-only system snapshot and a writable data volume; `/` reports capacity per-snapshot, not against the shared container. Fix: query `/System/Volumes/Data` on Catalina+ with fallback to `/`. Spec updated.
- mac-health: new personal-tooling subdirectory under `tools/mac-health/` for scheduled launchd-driven macOS health checks (memory, disk, leftovers). Landed intent + ADR-001 + spec (v0.1), checks runtime (`lib/common.sh`, three check scripts + a disk-leftovers wrapper), two LaunchAgent plists, `newsyslog` rotation config (1 MB / 5 gzipped archives), `install.sh`/`uninstall.sh` (installer refuses if `terminal-notifier` is missing on `PATH`), and `README.md`. 27-case shell test suite covers all 15 spec behavior tests. By design not an ai-labs project: no CI workflow, no release unit, no Components row, no `loc-dashboard` entry.

## 2026-05-17

- my-way: added `docs/my-way/prd-vs-product-intent.md`, a short framing note contrasting Product Intent with a PRD — PRD as a god document optimizing for "one place to look", Product Intent as a deliberately narrow layer optimizing for "one thing per place" with the rest delegated down the artifact chain.

## 2026-05-16

- dev-skills: added a local landing at `dev-skills/index.html` with a workflow graph and full 36-skill catalog. Linked the Dev Skills product card to the landing so the marketplace surface is discoverable from `docs/products.html`.

## 2026-05-12

- research/courses: added `aiforwork/` competitor extraction (page-content, course-curriculum, selling-points) mirroring the `khakhalev/` three-file pattern, plus a top-level `positioning-notes.md` distilling both surveys into a market map and a list of unfilled positioning slots (engineering-manager audience, EN-language market, senior judgment / failure post-mortems, curated cross-role structured path, async durable-artifact format, B2B-led channel). Inputs to `decision-matrix.md`; no commitments. The two surveyed RU offers split by *object of practice* (shared codebase vs participant's own routine), not by level — informing how the decision matrix reads its `Who` axis.
- Reinix rename: completed the pre-public product rename from Regentara to Reinix across the workspace package, CLI/runtime identity, release unit config, CI workflow, dashboard registries, docs, examples, and tests. No compatibility aliases were retained for the old CLI/config/URI names.

## 2026-05-10

- dashboard-sync-agent: Phase B complete and live. New OpenClaw account `dashboardsync` bound to bot `@dashboard_sync_agent_bot` (allowlisted DMs from chat 54589373); agent `dashboard-sync-agent` with workspace `/home/openclaw/.openclaw/workspace-dashboard-sync`; daily cron at 18:00 UTC (wrapper enforces 6h post-manual-run suppression). End-to-end dry run on `gpt-5.5` produced PR #355 covering all three surfaces (script header/loop/known list, products.html cards, loc-dashboard.html data array); merged. Cosmetic imperfection: Oracle's curated subtitle `"Oracle — Am I Done?"` lands inside the `<strong>` lead instead of replacing the card name — mirrors the existing Dragoman style. Spec iteration on `gpt-5.2` had revealed two model-interpretation issues (inverted "no product-type chip" rule, sub-component misclassification); both resolved by switching the OpenClaw default to `gpt-5.5`, not by spec changes. Plan archived to `dashboard-sync-agent/docs/plans/implemented/`.
- dashboard-sync-agent: B1 — CI sync workflow at `.github/workflows/dashboard-sync-agent-sync.yml` watches `dashboard-sync-agent/agent/**` on `trunk` and rsyncs to the OpenClaw VPS workspace, renaming `agent.md` → `AGENTS.md` on copy. Reuses the existing `OPENCLAW_DEPLOY_SSH_KEY` repo secret. Mirrors `doc-drift-agent`'s sync workflow.
- Products page: removed redundant type chips from grouped product cards in `docs/products.html`; the group headers now carry the category, and a regression test covers the static page markup.
- dashboard-sync-agent: Phase A complete. In-repo agent definition under `dashboard-sync-agent/agent/` — project-registry rule, synthesis spec, agent.md system prompt, report-format + fix-PR-template, notification spec (silent on scheduled+no-drift), and suppression policy (6h gate). Single stable branch `dashboard-sync/daily`; PR title `[dashboard-sync] daily sync — YYYY-MM-DD`. Open Questions resolved during Phase A. Phase B (CI sync workflow, VPS workspace, cron, dry run) remains.
- dashboard-sync-agent: registered as a top-level project for a sibling OpenClaw agent that keeps `scripts/loc-dashboard.sh`, `docs/products.html`, and the `docs/loc-dashboard.html` `data` array in sync with repo state on a daily 18:00 UTC cron. The root `README.md` `## Components` and `## Structure` tables are the authoritative project registries. Initial artifact set: intent + ADR v0.0.1 (proposed) + project README. README drift remains owned by `doc-drift-agent`; the two agents have disjoint editable-file allowlists.
- Process: clarified the plan-archive rule in `CLAUDE.md` — the `git mv docs/plans/<name>.md docs/plans/implemented/<name>.md` ships in the **same PR as the implementation**, not as a follow-up. The current loc-dashboard split landed in two PRs (#339 implementation, #340 plan archive) before the rule was sharpened; the new rule prevents the brief incoherent window on trunk where the implementation is in but the plan still sits as "to do".
- LOC dashboard: split `docs/loc-dashboard.html` into a LOC-only page plus a new `docs/products.html` portfolio page, each linking to the other. Refreshed the data array (clipdeck and doc-drift-agent had drifted post-merge), added a `Last updated:` footer line on the LOC page, and grouped the 18 product cards by category. Drove from validated design research; the rejected recommendations (grouped bars, hiding zero-rows, hero-ratio promotion) are recorded in the implementation plan as out of scope.
- doc-drift-agent: added PR-idempotence to the agent prompt. The agent now lists open `[doc-drift]` PRs before opening new ones and marks already-covered findings as `existing` instead of duplicating. Report and Telegram notification surfaces extended to carry `new`/`existing` status. Without the check, daily scheduled runs against an unmerged backlog of fix PRs would have produced duplicates each cycle.
- doc-drift-agent: rotated the docdrift bot token after GitGuardian flagged inline-token commits on the PR branch. Wrapper now reads the token from `openclaw.json` via `jq`; branch history rewritten and force-pushed (sanitized commit `c6621d90`). Token rotated via BotFather and updated on VPS. Inventory log records the incident.

## 2026-05-09

- doc-drift-agent: closed the manual-run timestamp gap. Probed the agent's tools live (write, exec, others — confirmed unrestricted). Added step 9 to the agent prompt: on manual runs, the agent writes `last_manual_run_utc` to `state.json` itself. Verified by isolating step 9 in a one-shot invocation. The 12h suppression gate is now operational.
- doc-drift-agent: live on OpenClaw VPS. Phase B end-to-end: CI sync workflow ships `doc-drift-agent/agent/**` on trunk merge; new Telegram bot `@igor1309_ai_labs_bot` routes to a dedicated agent with allowlisted DMs from chat `54589373`; daily cron at 01:00 UTC fires the agent against a refreshed `/home/openclaw/ai-labs` clone, posting a Telegram ack on every run; fix PRs are opened against `igor1309/ai-labs` via the maintainer's `gh auth` PAT. Dry run produced PRs #337 and #338 with the `[doc-drift]` title prefix. The original Phase A architecture assumed the wrong OpenClaw layout (a per-agent prompt directory under `~/.openclaw/agents/<name>/agent/`); the live layout uses workspace + binding with `AGENTS.md` as the system prompt — corrected during Phase B Task B1 plan rewrite.

- doc-drift-agent: Phase A complete. Committed the agent's full in-repo definition set — README inventory, drift methodology, agent prompt (`agent/agent.md`), drift report format, fix-PR template, Telegram notification spec, and 12-hour UTC suppression policy — under `doc-drift-agent/`. Branch convention pinned to `doc-drift/<slug>`; agent prompt filename inside `~/.openclaw/agents/doc-drift-agent/agent/` left provisional with verification owed to Phase B Task B2 (recorded as new open question #7). Plan stays at `doc-drift-agent/docs/plans/doc-drift-agent.md` until Phase B closes.
- doc-drift-agent: registered as a top-level project for the specialized OpenClaw agent that reviews README drift across `ai-labs`. Added project README and seed log, root `README.md` Components row, `scripts/loc-dashboard.sh` (header comment, per-project loop, drift `known` list), and `docs/loc-dashboard.html` product card + data array entry. `release-units.config.toml` intentionally not updated — the runtime lives in OpenClaw, not in this repo. Implementation plan in `doc-drift-agent/docs/plans/doc-drift-agent.md`; integration wiring (Phase B) is blocked on six open questions.

## 2026-05-07

- Scheduled workflows hardened against GitHub-hosted runner contention: shifted both `scheduled-health.yml` (06:00 → 06:17 UTC) and `loc-dashboard.yml` (06:00 → 06:23 UTC) off the top-of-hour cron herd that caused both runs to fail on 2026-05-06 with "The job was not acquired by Runner of type hosted even after multiple attempts" (15-minute queue timeouts, no script ever ran). Also added a Telegram failure-notify job to `loc-dashboard.yml` (mirroring the existing pattern in `scheduled-health.yml`) so a future silent miss surfaces instead of just being a missing daily snapshot.

## 2026-05-05

- clipdeck: app version moved from footer to header (next to the `clipdeck` wordmark), keeping the original subtle styling. Bumped to v0.1.12 to ship together with the v0.1.11 prompt title/subtitle flip whose tag was never created.

## 2026-05-04

- my-way: added `docs/my-way/informal-brief.md`, a personal-voice companion to the formal pre-/coding-phase notes that names the intuitions the structured docs cannot carry — intent is the hard part, brainstorm with a harness when it is stuck, prune to ~7 stories with forced justification, downstream must bend to intent. Linked from the landing hero and footer.
- my-way: copy-edit pass across `landing.html`, `pre-coding-phase.md`, `coding-phase.md`, the Product Intent note, the bug-fix variant, and the research and product-intent-review skills. Mostly added missing relative `that` (notably `"the user promise that downstream artifacts must preserve"` on the landing) and fixed tense/aspect (`"the process broke"` → `"is broken"`, `"meaningfully changing"` → `"being meaningfully changed"`).

## 2026-05-02

- LOC dashboard: refreshed the static landing from `scripts/loc-dashboard.sh` after the Product Intent docs landed on `user-stories`; agents docs now report 4,941 lines and repo total is 104,263.
- LOC dashboard refresh: synced `docs/loc-dashboard.html` data array with current `scripts/loc-dashboard.sh` output (clipdeck 0/0/290 → 1114/1472/1782; reinix 952/1712/4585 → 2792/4906/7964; smaller drift in nomos, dev-skills, session-digest, agents, repo-scripts, claude-insights). Updated the Clipdeck product card from docs-only to a deployed Cloudflare Worker (clipdeck.enoa.ai) with refreshed stack tags.
- my-way: implemented the Product Intent layer above research/pre-ADR/ADR/spec/implementation planning, adding story-centered note/structure/example artifacts, drafting/review skills, downstream traceability guidance, and lightweight variant escalation rules.
- GitHub Actions Node 20 deprecation cleared — bumped `actions/checkout@v4 → v5` (Node 24 runtime) and `dorny/paths-filter@v3 → v4` across all workflows ahead of the June 2026 forced upgrade and the September 2026 Node 20 removal. Stayed on `checkout@v5` rather than `v6` to avoid the credential-handling change in v6.
- clipdeck v0.1.7: added a deployed-version footer (`/api/version` + bottom-of-page render) so we can confirm at a glance which Worker build a browser is actually loading. Backfilled a missing frontend test that asserts the rendered subtitle text matches `item.subtitle` to lock in the description-fetch behavior shipped in v0.1.5/v0.1.6.

## 2026-05-01

- LOC dashboard landing: refreshed product cards in `docs/loc-dashboard.html` — promoted reinix from `Concept`/Design to a `CLI` MVP workflow runner with current tags, and renamed dragoman to "The Dragoman" with description and tags reflecting a posts-and-imagery channel rather than docs-only. `scripts/loc-dashboard.sh` was reviewed and needs no changes (it counts LOC and does not classify project type).
- clipdeck: added release-unit and CI/CD wiring for tag-driven Cloudflare Worker deploys, plus the first-deploy operator runbook and README component update.
- clipdeck: implemented the static iPhone frontend and Worker Static Assets routing, including unlock, reload, copy feedback, and resource-backed skill styling tests.
- clipdeck: implemented the authenticated `GET /api/items` Worker endpoint with GitHub Contents API reads, sanitized section assembly, and spec-shaped upstream/source-missing errors.
- clipdeck: implemented Phase 1 pure units for front matter stripping, prompt/skill discovery, and response section assembly, covering malformed front matter tolerance and deterministic item ordering.
- clipdeck: scaffolded as a private TypeScript Cloudflare Worker workspace with Wrangler config, Workers-pool Vitest coverage, and root test-gate integration.
- clipdeck: registered as a docs-only top-level project — added to `README.md` Components table, `scripts/loc-dashboard.sh` (loop, header comment, drift `known` list), and the `docs/loc-dashboard.html` landing (product card + data row). Initial artifacts are an accepted ADR and a draft spec for an iPhone-friendly private webpage that copies prompts/skills with server-side front matter stripping.
- New Project Checklist: added `docs/loc-dashboard.html` (product card + data array) and `<project>/docs/log.md` (seed entry) as required surfaces in `CLAUDE.md`, closing the drift that left dragoman off the landing on 2026-04-29. Also backfilled the dragoman product card and data row to clear that gap.
- Supabase keep-alive: switched the scheduled workflow from a SELECT ping to a PATCH against a dedicated `public.keepalive` table (`claude-insights/migrations/002_keepalive_table.sql`). Read-only pings did not reliably reset the free-tier inactivity timer — Supabase still issued a pause warning despite three days of green keep-alive runs. A write is unambiguous DB activity. Migration must be applied before the workflow change merges.

## 2026-04-30

- Linear: added `course-exploration` project (id `f4aa9d0e-3646-411c-8763-8239a2979937`) as a sibling of `ai-labs` to hold a raw, unstructured course-development idea; updated `CLAUDE.md` Linear section to list both projects under the shared workspace/team. Materials remain under `research/courses/` in this repo.
- pr-ci-watch: added `scripts/watch-pr.sh` wrapper and the `Bash(./scripts/watch-pr.sh:*)` allow rule so PR CI watching no longer triggers a permission prompt for the `/tmp/<repo>-pr-<pr>.log` redirect. The wildcard `Bash(... > /tmp/*)` form does not match a redirect with a trailing `2>&1`, so encapsulating the redirect inside a script is the cleanest fix.
- Linear: linked the repo to Linear project `ai-labs` (workspace `igor1309`, team `IG`, id `e94949cf-0479-4539-bced-7a737e5d874b`) by recording the metadata in `CLAUDE.md` so agents skip the lookup. Considered also adding a `.linear.toml` at the repo root for `schpet/linear-cli` compatibility — deferred until that CLI is actually adopted.
- Research: added a structured extraction, derived curriculum, and selling-points brief for Timur Khakhalev's AI Coding course landing page under `research/courses/khakhalev/`.

## 2026-04-29

- dragoman: renamed the docs-only top-level project directory from `the-dragoman/` to `dragoman/` so the project slug is distinct from the "The Dragoman" Telegram channel name.
- dragoman: registered as a docs-only top-level project — added to `scripts/loc-dashboard.sh` and the README `## Components` table. No CI changes needed: the project is absent from every `ci.yml` path filter, so per-project core jobs stay skipped on doc/image-only changes.
- LOC dashboard: classified `img`/`images` as known top-level dirs and added them to `EXCLUDES` in `scripts/loc-dashboard.sh` so README banner asset folders are explicitly skipped and no longer trip drift detection.
- LOC dashboard workflow: added `curl --max-time 30` to the Telegram step so a hung Telegram connection fails fast instead of stalling the run (root cause of the 2026-04-29 exit-56 failure).

## 2026-04-28

- Refreshed `docs/loc-dashboard.html` data array to match current `scripts/loc-dashboard.sh` output; reinix now reflects post-MVP code (`952/1712/4585`), and drifted entries for nomos, dev-skills, agents, session-digest, and repo-scripts updated.

## 2026-04-27

- ADR: added `docs/adr/cli-settings-convention.md` — repo-level rule covering discovery precedence, first-run bootstrap, structural-vs-catalog split, and settings-error class for CLI tools. Lists known violations in `reinix` and `session-digest` to close via per-tool plans.
- Nomos: remove inert `nomos-shared` declaration from the repo prod compose (CI never copies it) and the orphan `docker build -t nomos:latest .` from staging deploy. Cleanup of dead promises after the rollback redesign. See `nomos/docs/log.md`.
- Nomos: rewrite rollback path to operate on the actually-used `nomos-nomos:latest` image so a failed prod deploy can restore the previous version. See `nomos/docs/log.md`.
- Nomos: force `--build` on prod compose so deploys rebuild the auto-named prod image instead of caching the previously built version. See `nomos/docs/log.md`.
- Nomos: declare `nomos-shared` external network in the prod compose so Caddy retains staging connectivity across `docker compose down/up`. See `nomos/docs/log.md`.
- reinix: scaffolded as a Node ESM workspace package and release unit; LOC dashboard tests now treat it as an implemented code component instead of docs-only.
- reinix: created MVP workflow runner implementation plan from accepted spec and ADRs; addressed architecture-doc review (test ownership, skill references, release-unit posture, provider-CLI module split, worktree creation step, Node version pin, commit staging scope). See `reinix/docs/log.md`.
- Reverted out-of-scope Nomos release/deploy changes from the session-digest branch and removed the mistaken Nomos release tags.
- session-digest: replaced the Deep Agents prototype role with a V2 local-ledger and bounded-synthesis CLI, including dependency cleanup and component documentation updates.
- Process docs: made implementation plans explicitly declare execution mode, review stops, worktree mode, push policy, and final archiving so future plan execution can auto-continue without ambiguity.

## 2026-04-26

- session-digest: exploration docs complete (ADR-001, CLI spec, Deep Agents/NVIDIA NIM use cases, and TypeScript implementation plan). See `session-digest/docs/log.md`.

## 2026-04-25

- reinix: MVP ADR set complete (agent settings, model routing, CLI execution boundary, failure policy, run artifact storage). All reviewed and accepted. See `reinix/docs/log.md`.

## 2026-04-24

- Notio frontend v0.1.0: dark theme UI, fixed Cloudflare Pages deploy project name.

- AI Labs landing page: product cards for all 14 projects with 2-column grid and scroll/hover animations.

- Release docs: aligned explicit configured basename invariants and README component entries with the Notio backend/frontend release split.

- Release ADRs: clarified explicit configured basenames for nested release units so symmetric component folders can still use globally unambiguous tags.

- LOC dashboard: consolidated oracle into single row, added missing code extensions (.svelte, .sql, .css, .html, .mjs), merged gen/scripts columns into code, renamed text to docs, added per-project .md counting, added nexum/niora/reinix as regular rows, added .wrangler to exclusions.

- CI: narrowed `notio` path filter to Swift-only paths (Sources, Tests, Package.swift, Package.resolved), removing infra paths (supabase, Dockerfile, docker-compose, scripts, release.toml) that don't need the 15-min Swift test suite.

## 2026-04-23

- LOC dashboard: added reinix to known dirs and docs-only list, clearing drift warning.
- reinix: new project — AI orchestrator (governance/routing layer over other agents). Initial docs: naming brief, name pool, orchestration design, and research notes.
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
