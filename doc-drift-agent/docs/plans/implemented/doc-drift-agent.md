---
date: 2026-05-09
model: claude-opus-4-7
description: "Implementation plan: specialized OpenClaw agent for README drift review and PR-based fix suggestions"
source_intent: doc-drift-agent/docs/automated-doc-drift-review-and-fix-suggestions-intent.md (v0.0.3)
source_adr: doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review.md (v0.0.5)
---

# Implementation Plan: README Drift Review Agent

## Goal

Stand up a specialized OpenClaw agent that detects README drift across `ai-labs` (root README and per-project READMEs vs. each other and vs. actual repo state), reports findings with evidence, and proposes README fixes as PRs. Manual trigger is a Telegram comment to OpenClaw; scheduled checks run periodically with a 12-hour suppression after any manual run; notifications go out as both a PR and a Telegram ping. Auto-merge is never used.

## Source

- Intent: `doc-drift-agent/docs/automated-doc-drift-review-and-fix-suggestions-intent.md` (v0.0.3)
- ADR: `doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review.md` (v0.0.5, status: proposed)

The plan does not invent scope beyond these documents. Any decision not pinned in the source is captured under "Open Questions" and resolved before its dependent task starts.

## Architecture

OpenClaw routes agents by Telegram bot account, not by command. An agent is a `{ id, default, workspace }` triple in `~/.openclaw/openclaw.json` plus a `bindings[]` entry that maps a `(channel, accountId)` pair onto it. The agent's "system prompt" lives in the workspace as `AGENTS.md` (Claude Code convention); the agent reads any other workspace files at runtime.

Concrete layout for this agent:

- VPS workspace: `/home/openclaw/.openclaw/workspace-doc-drift/`. Initialized as a git repo to match the existing `main` workspace's shape. Synced from `ai-labs/doc-drift-agent/agent/`.
- The workspace's `AGENTS.md` is a copy of `ai-labs/doc-drift-agent/agent/agent.md`. Sibling files (`readme-inventory.md`, `drift-methodology.md`, `report-format.md`, `fix-pr-template.md`, `notification-spec.md`, `suppression-policy.md`) sit next to it and are read by the agent at runtime.
- New Telegram bot: `@igor1309_ai_labs_bot`. Token stored on the VPS in `/home/openclaw/.openclaw-keys`. Maintainer chat ID `54589373` is the only allowed sender.
- New OpenClaw account `docdrift` with `dmPolicy: "allowlist"`, `allowFrom: ["54589373"]`. New `agents.list` entry `{ id: "doc-drift-agent", workspace: "/home/openclaw/.openclaw/workspace-doc-drift" }`. New binding `{ agentId: "doc-drift-agent", match: { channel: "telegram", accountId: "docdrift" } }`.
- Per-agent state: `~/.openclaw/agents/doc-drift-agent/state.json` holds `{ last_manual_run_utc: "…" }` for the 12h suppression gate.
- GitHub identity for fix PRs: maintainer's personal PAT, stored alongside the bot token in `/home/openclaw/.openclaw-keys`.

`ai-labs` owns the source of truth for the agent's prompt, methodology, fix-PR shape, and notification format. CI is the bridge: a GitHub Actions workflow watches `doc-drift-agent/agent/**` on `trunk` and rsyncs to the VPS workspace on merge.

## Tech Stack

- Markdown for agent definition and supporting docs.
- GitHub PRs as the fix delivery channel (via OpenClaw's GitHub credentials).
- Telegram as the human notification + manual-trigger channel (reuses existing notio Telegram transport conventions where applicable).
- No new code introduced in this repo by Phase A. Phase B may add a small repo-side helper if the integration shape requires it.

## Execution Lock

- Execution mode: `human-review-gated`
- Human review between tasks: yes
- Worktree mode: `create new`
- Expected worktree: `worktrees/doc-drift-agent`
- Expected branch: `codex/doc-drift-agent`
- Push policy: `push after task`
- Preflight check: [ ] done

Rationale for `human-review-gated`: the ADR is `status: proposed`, several integration decisions are open, and the agent's drift heuristics need maintainer calibration before being wired into a scheduled loop.

## Decisions (resolved 2026-05-09)

The seven open questions that originally blocked Phase B were closed during Phase A's late hours after the inventory at `/Users/igormalyarov/Developer/my-apps/inventory` was scanned end-to-end and a live SSH read of `~/.openclaw/openclaw.json` confirmed the runtime shape. Recorded here as the source of truth for Phase B execution.

1. **Sync mechanism.** Decision: CI pushes on change. A GitHub Actions workflow on `trunk` rsyncs `doc-drift-agent/agent/**` to `openclaw@107.172.143.196:/home/openclaw/.openclaw/workspace-doc-drift/` whenever those files change. Requires a deploy SSH key in repo secrets.
2. **Manual-trigger contract.** Decision: command `/doc-drift-review` issued via DM to `@igor1309_ai_labs_bot` from chat `54589373`. No extra auth check beyond the Telegram-account allowlist (`allowFrom: ["54589373"]` on the new account); private bot + private chat is the perimeter.
3. **Last-manual-run timestamp store.** Decision: per-agent state file `~/.openclaw/agents/doc-drift-agent/state.json` containing `{ last_manual_run_utc: "<ISO 8601 UTC>" }`. The runtime writes on successful manual run completion and reads on every scheduled tick.
4. **Scheduled cadence.** Decision: daily 01:00 UTC via VPS cron (matches OpenClaw operational patterns; no GitHub Actions runner herd to dodge since cron runs on the VPS).
5. **GitHub identity for fix PRs.** Decision: maintainer's personal PAT (`repo` scope) stored on the VPS in `/home/openclaw/.openclaw-keys`. Branch convention `doc-drift/<slug>` was pinned in `doc-drift-agent/agent/agent.md` during A4.
6. **Telegram notification chat.** Decision: same chat as the manual-trigger listener — `54589373` via `@igor1309_ai_labs_bot`. No separate alerts chat.
7. **Agent prompt filename and runtime path.** Decision: not `~/.openclaw/agents/<name>/agent/agent.md` — that directory has no semantic role for prompts in OpenClaw. The prompt lives in the workspace as `AGENTS.md`; the runtime path is `/home/openclaw/.openclaw/workspace-doc-drift/AGENTS.md`. The CI sync renames `agent.md` → `AGENTS.md` on copy.

## Phase A — In-repo definitions (unblocked)

Goal: commit every artifact OpenClaw will need from `ai-labs`, in a form reviewable in isolation. No runtime wiring.

### Task A1: Component landing

**Files:**
- Create: `doc-drift-agent/` directory (top-level project landing).
- Create: `doc-drift-agent/README.md`.
- Create: `doc-drift-agent/docs/log.md`.
- Update: `README.md` `## Components` table.
- Update: `scripts/loc-dashboard.sh` (`ROW PROJECTS` header, per-project loop, `known` list in `check_project_drift`).
- Update: `docs/loc-dashboard.html` (product reveal card + chart `data` entry).
- Update: `docs/log.md` (top-level entry).

Per CLAUDE.md "New Project Checklist". `release-units.config.toml` is intentionally not updated — `doc-drift-agent` is not a shippable release unit; its runtime lives in OpenClaw.

**Verification:** Markdown structure check on changed/new docs, `git diff` scope check, `bash scripts/loc-dashboard.sh` runs without drift warnings.

### Task A2: README inventory

**Files:**
- Create: `doc-drift-agent/agent/readme-inventory.md`.

Enumerate every README the agent must inspect. Generate from current repo state (root README + per-project READMEs found one level below `/`). For each entry record: path, owning component, role (root vs. project), and any explicit "Components"-style cross-reference into other READMEs.

**Verification:** every path resolves; every project listed in the root `README.md` `## Components` table has a corresponding entry, and vice versa.

### Task A3: Drift methodology

**Files:**
- Create: `doc-drift-agent/agent/drift-methodology.md`.

Define what drift the agent looks for, faithful to the intent's three categories:

1. README ↔ README (claims in one README contradicted by another, e.g. component descriptions out of sync).
2. README ↔ repo state (claims contradicted by the actual repo: missing paths, renamed components, removed features still documented, new top-level dirs not in the Components table).
3. Internal consistency (a README claims behavior its own code/config does not support).

For each category record: detection signal, evidence shape (what to attach to a finding), false-positive examples to skip. Out of scope (no rewriting/restructuring/style) is restated explicitly to mirror the existing `doc-drift-audit` skill's discipline.

**Verification:** maintainer review confirms each category and signal aligns with the intent doc; cross-check against `dev-skills/public/doc-drift-audit/SKILL.md` for any unintentional scope drift between the two.

### Task A4: Agent definition

**Files:**
- Create: `doc-drift-agent/agent/agent.md` (or equivalent prompt artifact — exact filename pinned during this task to match whatever OpenClaw expects, if known by then).

Author the agent's system prompt / instructions. Inputs: README inventory + drift methodology. Outputs: a structured drift report (see Task A5) and, per finding, a proposed README patch.

Constraints baked into the prompt:

- Never edit any file other than READMEs.
- Never merge a PR; never approve a PR.
- Each finding must carry evidence (file paths + line refs or commit refs).
- Each suggested fix must be the minimum edit that resolves the drift.

**Verification:** agent definition reviewed against the ADR's "The agent will:" bullet list — every bullet has a corresponding instruction.

### Task A5: Drift report + fix PR shape

**Files:**
- Create: `doc-drift-agent/agent/report-format.md`.
- Create: `doc-drift-agent/agent/fix-pr-template.md`.

Pin the report shape (drift category, evidence, suggested change, proposed PR link if any) and the PR template (title prefix e.g. `[doc-drift]`, body sections: finding, evidence, scope-of-change checklist, "do not auto-merge" reminder).

**Verification:** dry-run a hand-authored example report + example PR body against current repo state; confirm format is unambiguous and reproducible.

### Task A6: Notification + suppression spec

**Files:**
- Create: `doc-drift-agent/agent/notification-spec.md`.
- Create: `doc-drift-agent/agent/suppression-policy.md`.

Notification spec: Telegram message format for "drift found" (summary line, count by category, list of opened PRs with links) and "no drift found" (silent or short ack — maintainer to choose).

Suppression policy: scheduled run is skipped if the persisted last-manual-run timestamp is within 12 hours; ties broken by the policy doc, not by code. State the timezone and the comparison rule explicitly.

**Verification:** policy doc is unambiguous enough that two reviewers compute the same skip/run decision from the same timestamp inputs.

### Task A7: Phase A closeout

**Files:**
- Update: `docs/log.md`.
- Update: `doc-drift-agent/docs/log.md`.
- Move: this plan stays in `docs/plans/` until Phase B closes; only the Phase A checkboxes are flipped.

**Verification:** Phase A checklist below all checked; `git status` clean; PR opened against `trunk` for human review per execution mode.

## Phase B — Integration wiring

All Decisions above are resolved. Phase B executes in order.

### Task B1: Plan rewrite (this task)

Replace Open Questions with Decisions; rewrite Architecture and Phase B tasks to match OpenClaw's actual workspace+binding model; correct `doc-drift-agent/agent/agent.md` "Runtime layout" section to drop the wrong `~/.openclaw/agents/<name>/agent/` claim and pin the workspace path. No external action.

### Task B2: CI sync workflow

**Files:**
- Create: `.github/workflows/doc-drift-agent-sync.yml`.

The workflow watches `doc-drift-agent/agent/**` on `trunk`. On push, it rsyncs the directory to `openclaw@107.172.143.196:/home/openclaw/.openclaw/workspace-doc-drift/`, renaming `agent.md` → `AGENTS.md` in the destination. Uses an SSH deploy key stored in repo secret `OPENCLAW_DEPLOY_SSH_KEY` (the user adds this secret out-of-band before the workflow can succeed).

### Task B3: VPS workspace, openclaw.json, restart

Performed via SSH against `openclaw@107.172.143.196`. Steps in order:

1. `mkdir -p /home/openclaw/.openclaw/workspace-doc-drift && cd ... && git init`.
2. Seed the workspace with the current `doc-drift-agent/agent/` contents (renaming `agent.md` → `AGENTS.md`). Subsequent updates flow via the CI sync workflow.
3. Append `@igor1309_ai_labs_bot`'s token to `/home/openclaw/.openclaw-keys` (mode 600).
4. Edit `~/.openclaw/openclaw.json`:
   - `channels.telegram.accounts.docdrift`: `{ botToken: "<TOKEN>", dmPolicy: "allowlist", allowFrom: ["54589373"], groupPolicy: "disabled", streaming: "partial" }`.
   - `agents.list`: append `{ id: "doc-drift-agent", workspace: "/home/openclaw/.openclaw/workspace-doc-drift" }`.
   - `bindings`: append `{ agentId: "doc-drift-agent", match: { channel: "telegram", accountId: "docdrift" } }`.
5. `sudo systemctl restart openclaw` (root-only) and verify `systemctl status openclaw` is active.

**Verification:** `openclaw agent --agent doc-drift-agent --message "ping"` returns; `tail /home/openclaw/.openclaw/logs/gateway.log` shows the new bot polling without auth errors.

### Task B4: Scheduled cron + suppression state

Performed via SSH. Steps:

1. `mkdir -p /home/openclaw/.openclaw/agents/doc-drift-agent && echo '{"last_manual_run_utc": null}' > /home/openclaw/.openclaw/agents/doc-drift-agent/state.json`.
2. Add `/etc/cron.d/openclaw-doc-drift` (root-owned, mode 644) firing daily at 01:00 UTC. The cron command consults `state.json` per `agent/suppression-policy.md` and either skips or invokes the agent via `openclaw agent --agent doc-drift-agent --message "/doc-drift-review --scheduled"`.

**Verification:** `crontab -l` (root) shows the entry; a manual test run of the cron script with the suppression rule confirms the skip/run decision against synthetic timestamps.

### Task B5: End-to-end dry run

DM `/doc-drift-review` to `@igor1309_ai_labs_bot` from chat `54589373`. Confirm:

- Bot acknowledges the command.
- A drift report is rendered per `agent/report-format.md`.
- Any opened PRs use the `doc-drift/<slug>` branch convention and the `[doc-drift]` title prefix per `agent/fix-pr-template.md`.
- A Telegram notification (drift-found or manual-no-drift ack) is posted to chat `54589373` per `agent/notification-spec.md`.
- `state.json` `last_manual_run_utc` is updated.

PRs opened during the dry run are reviewed but not merged.

### Task B6: Phase B closeout

**Files:**
- Update: `docs/log.md`.
- Update: `doc-drift-agent/docs/log.md`.
- Move: `doc-drift-agent/docs/plans/doc-drift-agent.md` → `doc-drift-agent/docs/plans/implemented/doc-drift-agent.md`.

Push branch and update PR #336.

## Out of Scope

- Auto-merge of fix PRs (explicitly forbidden by the ADR).
- Edits to non-README files by the agent.
- Style/format/restructure passes (mirrors `doc-drift-audit` discipline).
- Standing up a new OpenClaw instance — the ADR mandates reuse of the existing one.
- Migrating the existing `doc-drift-audit` skill into the new agent. The two coexist; `doc-drift-audit` is interactive/maintainer-driven and broader than READMEs.

## Phase A Checklist

- [x] A1 Component landing
- [x] A2 README inventory
- [x] A3 Drift methodology
- [x] A4 Agent definition
- [x] A5 Drift report + fix PR shape
- [x] A6 Notification + suppression spec
- [x] A7 Phase A closeout

## Phase B Checklist

- [x] B1 Plan rewrite
- [x] B2 CI sync workflow
- [x] B3 VPS workspace + openclaw.json + restart
- [x] B4 Scheduled cron + suppression state
- [x] B5 End-to-end dry run
- [x] B6 Phase B closeout
