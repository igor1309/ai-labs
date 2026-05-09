---
date: 2026-05-09
model: claude-opus-4-7
description: "Implementation plan: specialized OpenClaw agent for README drift review and PR-based fix suggestions"
source_intent: doc-drift-agent/docs/automated-doc-drift-review-and-fix-suggestions-intent.md (v0.0.3)
source_adr: doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review-v0.0.4.md (v0.0.5)
---

# Implementation Plan: README Drift Review Agent

## Goal

Stand up a specialized OpenClaw agent that detects README drift across `ai-labs` (root README and per-project READMEs vs. each other and vs. actual repo state), reports findings with evidence, and proposes README fixes as PRs. Manual trigger is a Telegram comment to OpenClaw; scheduled checks run periodically with a 12-hour suppression after any manual run; notifications go out as both a PR and a Telegram ping. Auto-merge is never used.

## Source

- Intent: `doc-drift-agent/docs/automated-doc-drift-review-and-fix-suggestions-intent.md` (v0.0.3)
- ADR: `doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review-v0.0.4.md` (v0.0.5, status: proposed)

The plan does not invent scope beyond these documents. Any decision not pinned in the source is captured under "Open Questions" and resolved before its dependent task starts.

## Architecture

The agent lives inside the existing OpenClaw instance (separate external host). `ai-labs` owns the source of truth for the agent's definition, methodology, fix-PR shape, and notification format; OpenClaw owns scheduling, the Telegram listener that receives manual triggers, and the runtime that invokes the agent.

Artifact split:

- `ai-labs` (this repo) — agent prompt/instructions, README inventory, drift methodology, fix-PR template, Telegram message format, suppression policy spec.
- OpenClaw (external) — runtime, schedule, Telegram listener, GitHub credentials for opening PRs, last-manual-run timestamp store consulted by the 12h gate.

Sync mechanism between the two is an open question (see below); the plan keeps repo artifacts decoupled from a specific sync method so Phase A can land without depending on it.

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

## Open Questions (block Phase B)

These must be resolved before any task in Phase B is started. Phase A does not depend on them.

1. **OpenClaw ↔ ai-labs integration shape.** How the agent definition is delivered to OpenClaw (git pull from `ai-labs`, push from CI, manual sync, embedded snapshot, etc.). The ADR does not pin this.
2. **Manual-trigger contract.** Exact Telegram command/syntax (e.g. `/doc-drift-review`), which chat OpenClaw listens in, and how OpenClaw authenticates the requester as the maintainer.
3. **Last-manual-run timestamp store.** Where OpenClaw persists the timestamp consulted by the 12h suppression gate (OpenClaw-local file, repo file, external KV).
4. **Scheduled cadence.** The ADR mandates scheduled drift checks but does not specify the period (daily? weekly?). Maintainer to set.
5. **GitHub identity for fix PRs.** Which account opens PRs (a bot account vs. a personal token). Branch-name convention is pinned to `doc-drift/<slug>` in `doc-drift-agent/agent/agent.md` (resolved during A4).
6. **Telegram notification chat.** Same chat as the manual-trigger listener, or a separate "alerts" chat.
7. **Agent prompt filename inside `~/.openclaw/agents/doc-drift-agent/agent/`.** Provisional value `agent.md` matches the directory name but is not confirmed against the OpenClaw runtime. Phase B Task B2 must verify against an existing agent on the VPS (or `openclaw --help` / `openclaw doctor`) and rename the artifact if OpenClaw expects a different filename.

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

## Phase B — Integration wiring (blocked on Open Questions 1–6)

Do not start until every Open Question above has a recorded decision in the plan.

### Task B1: Resolve open questions

Edit this plan: replace each Open Question with a "Decision:" line carrying the chosen value. Commit the resolution as a single change. No code yet.

### Task B2: Sync mechanism

Implement whatever was decided in Open Question 1. If git-pull-by-OpenClaw: confirm OpenClaw can read this repo and document the path. If push-from-CI: add a workflow that ships the agent definition on changes under `doc-drift-agent/agent/`. If manual: document the operator runbook.

### Task B3: Manual-trigger handler

Document (or wire, depending on B1) the Telegram-comment manual trigger. Confirm OpenClaw's listener authenticates the maintainer and writes the last-manual-run timestamp.

### Task B4: Scheduled run + suppression gate

Configure the scheduled cadence chosen in Open Question 4. Verify the 12h suppression gate is consulted on every scheduled tick.

### Task B5: End-to-end dry run

Trigger the agent manually via Telegram against current `trunk`. Confirm: at least one finding (or a clean "no drift" report), evidence attached, a real PR opened against `trunk` for any fix, Telegram notification posted. PR is reviewed but not merged.

### Task B6: Phase B closeout

**Files:**
- Update: `docs/log.md`.
- Update: `doc-drift-agent/docs/log.md`.
- Move: `doc-drift-agent/docs/plans/doc-drift-agent.md` → `doc-drift-agent/docs/plans/implemented/doc-drift-agent.md`.

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

- [ ] B1 Resolve open questions
- [ ] B2 Sync mechanism
- [ ] B3 Manual-trigger handler
- [ ] B4 Scheduled run + suppression gate
- [ ] B5 End-to-end dry run
- [ ] B6 Phase B closeout
