---
date: 2026-05-10
model: claude-opus-4-7
description: "Implementation plan: specialized OpenClaw agent that keeps scripts/loc-dashboard.sh, docs/products.html, and the docs/loc-dashboard.html data array in sync with repo state on a daily 18:00 UTC cron"
source_intent: dashboard-sync-agent/docs/intent.md (2026-05-10)
source_adr: dashboard-sync-agent/docs/adr-specialized-openclaw-agent-dashboard-sync-v0.0.1.md (v0.0.1)
---

# Implementation Plan: Dashboard and Loc-Script Sync Agent

## Goal

Stand up a specialized OpenClaw agent — sibling to `doc-drift-agent` — that reads the root `README.md` `## Components` and `## Structure` tables (the authoritative project registries) plus per-project READMEs (for enrichment fields), regenerates `docs/products.html` cards, keeps `scripts/loc-dashboard.sh` in sync with the registries, and refreshes the `docs/loc-dashboard.html` `data` array from the script's output. The agent runs daily at 18:00 UTC and on manual Telegram trigger; it proposes changes as a single PR per run on a reused stable branch; it never merges.

## Source

- Intent: `dashboard-sync-agent/docs/intent.md`
- ADR: `dashboard-sync-agent/docs/adr-specialized-openclaw-agent-dashboard-sync-v0.0.1.md` (v0.0.1, status: proposed)

The plan does not invent scope beyond these documents. Any decision not pinned in the source is captured under "Open Questions" and resolved before its dependent task starts.

## Architecture

OpenClaw's runtime layout (confirmed live during `doc-drift-agent`'s Phase B): agents are routed by Telegram bot account, not by command. An agent is a `{ id, default, workspace }` triple in `~/.openclaw/openclaw.json` plus a `bindings[]` entry mapping a `(channel, accountId)` pair onto it. The agent's system prompt lives at `<workspace>/AGENTS.md`; sibling files in the same workspace are read by the agent at runtime.

Concrete layout for this agent:

- VPS workspace: `/home/openclaw/.openclaw/workspace-dashboard-sync/`. Initialized as a git repo to match the existing pattern. Synced from `ai-labs/dashboard-sync-agent/agent/`.
- The workspace's `AGENTS.md` is a copy of `ai-labs/dashboard-sync-agent/agent/agent.md`. Sibling files (project-registry rule, synthesis spec, fix-PR template, notification spec, suppression policy) sit next to it and are read by the agent at runtime.
- New Telegram bot allocated for this agent (separate from `@igor1309_ai_labs_bot` because OpenClaw routes by bot account). Token stored on the VPS in `/home/openclaw/.openclaw-keys`. Maintainer chat ID `54589373` is the only allowed sender.
- New OpenClaw account `dashboardsync` with `dmPolicy: "allowlist"`, `allowFrom: ["54589373"]`. New `agents.list` entry `{ id: "dashboard-sync-agent", workspace: "/home/openclaw/.openclaw/workspace-dashboard-sync" }`. New binding `{ agentId: "dashboard-sync-agent", match: { channel: "telegram", accountId: "dashboardsync" } }`.
- Per-agent state: `~/.openclaw/agents/dashboard-sync-agent/state.json` holds `{ last_manual_run_utc: "…" }` for the suppression gate.
- GitHub identity for sync PRs: maintainer's personal PAT, reusing the credentials already provisioned for `doc-drift-agent`.
- Source tree mirror: `/home/openclaw/ai-labs` (already maintained for `doc-drift-agent`'s daily refresh; reused — no second clone).

`ai-labs` owns the source of truth for the agent's prompt, registry rule, synthesis spec, fix-PR shape, and notification format. CI is the bridge: a GitHub Actions workflow watches `dashboard-sync-agent/agent/**` on `trunk` and rsyncs to the VPS workspace on merge.

## Tech Stack

- Markdown for agent definition and supporting docs.
- GitHub PRs as the sync delivery channel (via OpenClaw's GitHub credentials).
- Telegram as the human notification + manual-trigger channel.
- No new code introduced in this repo by Phase A. Phase B may add a small repo-side helper if the integration shape requires it.

## Execution Lock

- Execution mode: `human-review-gated`
- Human review between tasks: yes
- Worktree mode: `existing` — `worktrees/dashboard-sync-agent` (already created during the kickoff PR)
- Branch: `codex/dashboard-sync-agent`
- Push policy: `push after task`
- Preflight check: [ ] done

Rationale for `human-review-gated`: the ADR is `status: proposed`, several integration decisions are open, and the agent's first run is itself a test of the design — maintainer should review the agent definition and synthesis spec before wiring them into a scheduled loop.

## Open Questions (to resolve before Phase B)

These are not blockers for Phase A (in-repo definitions). They become blockers once Phase B starts.

1. **Telegram bot allocation.** Allocate a new bot (`@igor1309_ai_labs_dashboard_bot` or similar) for `dashboard-sync-agent`, OR investigate whether OpenClaw can route a single bot to multiple agents via command parsing. Default: separate bot.
2. **Suppression policy strength.** doc-drift uses a 12-hour gate. For dashboard-sync, daily refresh + manual triggers may want a shorter gate (e.g. 6h) since the agent's output is mechanical regen rather than judgment work. Resolved by Task A6.
3. **Branch convention.** Intent says "reuses a stable branch so re-runs update an existing PR." Pin to a single fixed branch name (`dashboard-sync` or `dashboard-sync/daily`)? Resolved by Task A4.
4. **PR title prefix.** Mirror `[doc-drift]` with `[dashboard-sync]`? Resolved by Task A5.
5. **Manual-trigger command.** `/dashboard-sync` (verb) or `/sync-dashboards`? Resolved by Task A4.
6. **Audit script for project-registration drift.** Optional independent check (`scripts/check-project-registration.sh` listing top-level dirs absent from `## Components` or `## Structure`, fails CI if non-empty). Defer; track as a follow-up. Not part of the agent.

## Phase A — In-repo definitions

Goal: commit every artifact OpenClaw will need from `ai-labs`, in a form reviewable in isolation. No runtime wiring.

### Task A1: Component landing — DONE (kickoff PR)

The kickoff PR landed `dashboard-sync-agent/README.md`, `dashboard-sync-agent/docs/intent.md`, the ADR, `dashboard-sync-agent/docs/log.md`, the repo-level log entry, and the `README.md` `## Components` row. The agent-owned surfaces (`scripts/loc-dashboard.sh`, `docs/products.html`, `docs/loc-dashboard.html` data array) were intentionally NOT pre-populated — the agent's first run is the test that the design works, and pre-populating those surfaces would bypass that test.

**Verification:** kickoff PR merged.

### Task A2: Project-registry rule

**Files:**
- Create: `dashboard-sync-agent/agent/project-registry.md`.

Pin the rule for resolving the tracked project set from the root `README.md`. Inputs: `## Components` and `## Structure` tables. Outputs: the canonical sorted list of top-level directories tracked by surfaces (1)–(3). Cover:

- Filtering rule: a row counts only when its `Name` (Components first column) or `Path` (Structure first column) maps to an existing top-level directory. Sub-components like `notio-backend`, `docker/langfuse` are skipped.
- Deduplication: a directory appearing in both tables is counted once.
- "Untracked candidates" surfacing: top-level directories present in the repo but absent from both tables are listed in the PR description as "candidates for Components or Structure registration" and not silently added to or removed from the agent's tracked set.
- Edge cases: removed directory still in the table (drift the agent surfaces but does not auto-remove); table renamed; row reordering (no-op for the agent — set semantics, not order).

**Verification:** worked example against current `trunk` produces the expected tracked set; the "candidates" list contains `neris` and `niora` (currently in the loc-dashboard loop but absent from both registries).

### Task A3: Synthesis spec

**Files:**
- Create: `dashboard-sync-agent/agent/synthesis-spec.md`.

For each agent-owned surface, pin the rules that map the registry + READMEs to the surface's content. Cover:

- `scripts/loc-dashboard.sh` — exact regex / textual anchor rules for editing the `ROW PROJECTS` header comment, the `for proj in ...` loop on line 171, and the `known` list inside `check_project_drift`. Sort order in each location. Whitespace conventions.
- `docs/products.html` — for each tracked Components-table entry, how to render the card: `Name` → `<span class="product-name">`, `Type` → `<span class="product-type">`, `Description` → `<p class="product-desc">`, `<div class="product-stack">` tags. Where the agent reads per-project README for enrichment (e.g. deployed URL: pull from `## Deployment` or "Deployed at" lines). Category-header assignment: Components-`Type`-to-category mapping table (e.g. `Web App` → "Web Apps", `MCP tool` → "MCP Servers", `Agent definition` → "Editorial & Agents", etc.).
- `docs/loc-dashboard.html` `data` array — exact line and indentation conventions, ordering, what to do with projects whose LOC is 0/0/0.

**Verification:** the spec is precise enough that two reviewers regenerate identical output from the same inputs.

### Task A4: Agent definition

**Files:**
- Create: `dashboard-sync-agent/agent/agent.md`.

Author the agent's system prompt. Inputs: project-registry rule, synthesis spec, READMEs in the source tree at `/home/openclaw/ai-labs`. Outputs: a structured sync report, a single PR per run when there is drift.

Constraints baked into the prompt:

- Editable-file allowlist (the three surfaces + per-agent state file). Any other write is a refusal.
- Never merge a PR; never approve a PR.
- Single stable branch for re-runs (resolves Open Question 3).
- Manual-trigger command (resolves Open Question 5).
- Idempotence: if the open PR on the stable branch already covers the current drift, do not push or comment. If new drift appears, force-update the branch.
- Per-surface short-circuit: skip surfaces with zero drift; if all three are clean, do nothing.

**Verification:** agent definition reviewed against the ADR's "The agent will:" bullet list — every bullet has a corresponding instruction.

### Task A5: Sync report + fix PR template

**Files:**
- Create: `dashboard-sync-agent/agent/report-format.md`.
- Create: `dashboard-sync-agent/agent/fix-pr-template.md`.

Pin the report shape (per-surface drift summary, candidates section, change preview) and the PR template (title prefix `[dashboard-sync]` per Open Question 4 default; body sections: surface-by-surface change summary, candidates list, "do not auto-merge" reminder).

**Verification:** dry-run a hand-authored example report + PR body against current `trunk`; confirm format is unambiguous and reproducible. The example must include `dashboard-sync-agent` itself as drift across all three surfaces and `neris`/`niora` in the candidates section.

### Task A6: Notification + suppression spec

**Files:**
- Create: `dashboard-sync-agent/agent/notification-spec.md`.
- Create: `dashboard-sync-agent/agent/suppression-policy.md`.

Notification spec: Telegram message format for "drift found" (per-surface summary, opened PR link), "no drift found + manual" (short ack), "no drift found + scheduled" (silent).

Suppression policy: scheduled run is skipped if the persisted last-manual-run timestamp is within the suppression window. Resolves Open Question 2 — pin the window. State the timezone (UTC) and the comparison rule explicitly.

**Verification:** policy doc is unambiguous enough that two reviewers compute the same skip/run decision from the same timestamp inputs.

### Task A7: Phase A closeout

**Files:**
- Update: `docs/log.md`.
- Update: `dashboard-sync-agent/docs/log.md`.

Phase A checklist below all checked; `git status` clean; PR opened against `trunk` for human review per execution mode.

## Phase B — Integration wiring

Phase B begins once all Open Questions are resolved and Phase A is merged.

### Task B1: CI sync workflow

**Files:**
- Create: `.github/workflows/dashboard-sync-agent-sync.yml`.

The workflow watches `dashboard-sync-agent/agent/**` on `trunk`. On push, it rsyncs the directory to `openclaw@107.172.143.196:/home/openclaw/.openclaw/workspace-dashboard-sync/`, renaming `agent.md` → `AGENTS.md` in the destination. Uses the existing `OPENCLAW_DEPLOY_SSH_KEY` repo secret (provisioned for `doc-drift-agent`).

### Task B2: VPS workspace, openclaw.json, restart

Performed via SSH against `openclaw@107.172.143.196`. Steps in order:

1. `mkdir -p /home/openclaw/.openclaw/workspace-dashboard-sync && cd ... && git init`.
2. Seed the workspace with the current `dashboard-sync-agent/agent/` contents (renaming `agent.md` → `AGENTS.md`). Subsequent updates flow via the CI sync workflow.
3. Append the new bot's token to `/home/openclaw/.openclaw-keys` (mode 600).
4. Edit `~/.openclaw/openclaw.json`:
   - `channels.telegram.accounts.dashboardsync`: `{ botToken: "<TOKEN>", dmPolicy: "allowlist", allowFrom: ["54589373"], groupPolicy: "disabled", streaming: "partial" }`.
   - `agents.list`: append `{ id: "dashboard-sync-agent", workspace: "/home/openclaw/.openclaw/workspace-dashboard-sync" }`.
   - `bindings`: append `{ agentId: "dashboard-sync-agent", match: { channel: "telegram", accountId: "dashboardsync" } }`.
5. `sudo systemctl restart openclaw` and verify `systemctl status openclaw` is active.

**Verification:** `openclaw agent --agent dashboard-sync-agent --message "ping"` returns; `tail /home/openclaw/.openclaw/logs/gateway.log` shows the new bot polling without auth errors.

### Task B3: Scheduled cron + suppression state

Performed via SSH. Steps:

1. `mkdir -p /home/openclaw/.openclaw/agents/dashboard-sync-agent && echo '{"last_manual_run_utc": null}' > /home/openclaw/.openclaw/agents/dashboard-sync-agent/state.json`.
2. Add `/etc/cron.d/openclaw-dashboard-sync` (root-owned, mode 644) firing daily at 18:00 UTC. The cron command consults `state.json` per `agent/suppression-policy.md` and either skips or invokes the agent via `openclaw agent --agent dashboard-sync-agent --message "/dashboard-sync --scheduled"`. The wrapper refreshes `/home/openclaw/ai-labs` via `git fetch && git checkout trunk && git pull --ff-only` before invoking the agent (mirroring `doc-drift-cron.sh`).

**Verification:** `crontab -l` (root) shows the entry; a manual test run of the cron script with the suppression rule confirms the skip/run decision against synthetic timestamps.

### Task B4: End-to-end dry run

DM the manual-trigger command to the new bot from chat `54589373`. Confirm:

- Bot acknowledges the command.
- A sync report is rendered per `agent/report-format.md`.
- The opened PR uses the `[dashboard-sync]` title prefix and the stable branch convention per `agent/fix-pr-template.md`.
- The PR contains drift on all three surfaces for `dashboard-sync-agent` itself, plus `neris` and `niora` in the candidates section.
- A Telegram notification is posted to chat `54589373` per `agent/notification-spec.md`.
- `state.json` `last_manual_run_utc` is updated.

The PR opened during the dry run is reviewed; if it matches the synthesis spec, it can be merged as the agent's first authoritative regen of the three surfaces.

### Task B5: Phase B closeout

**Files:**
- Update: `docs/log.md`.
- Update: `dashboard-sync-agent/docs/log.md`.
- Move: `dashboard-sync-agent/docs/plans/dashboard-sync-agent.md` → `dashboard-sync-agent/docs/plans/implemented/dashboard-sync-agent.md` (in the same PR as the implementation, per CLAUDE.md).

Push branch and merge.

## Out of Scope

- Auto-merge of sync PRs (explicitly forbidden by the ADR).
- Edits to non-allowlisted files by the agent (READMEs, logs, release-units configs, CI workflows).
- Style/format/restructure passes on any surface.
- Standing up a new OpenClaw instance — reuse the existing one.
- Tracking sub-projects below top-level.
- Updating `README.md` `## Components` or `## Structure` (owned by `doc-drift-agent` / human registration).
- The optional `scripts/check-project-registration.sh` audit script (Open Question 6) — deferred to a follow-up.

## Phase A Checklist

- [x] A1 Component landing (kickoff PR)
- [x] A2 Project-registry rule
- [x] A3 Synthesis spec
- [x] A4 Agent definition
- [x] A5 Sync report + fix PR template
- [x] A6 Notification + suppression spec
- [x] A7 Phase A closeout

## Phase B Checklist

- [x] B1 CI sync workflow
- [ ] B2 VPS workspace + openclaw.json + restart
- [ ] B3 Scheduled cron + suppression state
- [ ] B4 End-to-end dry run
- [ ] B5 Phase B closeout
