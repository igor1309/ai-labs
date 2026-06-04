---
date: 2026-06-03
author: Igor Malyarov
version: 0.0.8
status: accepted
accepted: 2026-06-03
source_intent: Automated Doc Drift Review and Fix Suggestions. Intent v0.0.4
description: "Use a dedicated OpenClaw agent for README-only documentation drift review across ai-labs; fixes are README-edit PRs; never auto-merge. v0.0.8 reverts the scoped generalization (v0.0.6/0.0.7) and its orchestration (ADR-001) back to README-only — see revision history."
---

# ADR: Specialized OpenClaw Agent for README Drift Review

> **Reversion note (v0.0.8, 2026-06-03).** v0.0.6/v0.0.7 generalised this agent from
> README-only to per-project documentation **scopes**, with a separate orchestration
> ADR (`ADR-001`) and a tested selection layer. That effort was built, deployed, and
> **reverted** on 2026-06-03: the per-scope audits ran the OpenClaw worker via the
> codex CLI harness, which fails fatally on automatic compaction once a run's context
> exceeds the budget (`codex app-server owns automatic compaction`), and a whole
> project's docs were both too large and structurally too varied to be one universal
> audit unit. This ADR returns to the **README-only** scope that was stable. The
> attempt is preserved in git history and in `agents/research/` (the orchestration and
> spike notes) for anyone who wants the detail. A future, per-project review approach
> is a **separate** decision, not this ADR.

## 1. Executive Summary

Use a dedicated OpenClaw agent to detect **documentation drift** across the `ai-labs`
**README set** — the root `README.md` plus every top-level project's `README.md` — and
propose fixes as PRs. The agent reviews the whole README set in one pass per run:
cross-project README consistency, README vs repo state, and README vs the owning
project's code/config. It may PR-edit **READMEs only** — never code/config. The
doc-drift discipline (factual mismatch only, minimum edit, no style/restructure) and
the never-auto-merge rule are core and unchanged.

## 2. Context

`ai-labs` is a mono-repo of many projects; each has a README, and the repo has a root
README with a `## Components` table. READMEs drift from one another and from repo
state — the highest-value, most-bounded documentation surface. A dedicated OpenClaw
agent reviews them on a nightly cadence (and on manual trigger) and opens evidence-backed
fix PRs.

A 2026-06 effort to broaden the agent to per-project documentation **scopes** (all of a
project's `docs/`, selected and orchestrated by a tested CLI + cron wrapper) was
attempted and reverted (see the reversion note and revision history). README-only is the
deliberate, stable resting scope.

Constraints:

- Reuse the existing OpenClaw instance; one active run at a time on a small VPS.
- The maintainer reviews and merges; the agent never merges or approves.
- Reviews stay bounded — the README set, one pass.

Rejected alternatives:

- Edit anything, anywhere — wrong blast radius.
- Per-project `docs/**` scopes orchestrated nightly — attempted (v0.0.6/0.0.7 + ADR-001)
  and reverted; the codex harness compaction limit and structural variance between
  projects made it unfit. A future per-project approach will be designed fresh.

## 3. Decision

Use a specialized OpenClaw agent for **README drift review**:

- The agent reviews the **README set**: the root `README.md` plus each top-level
  project's `README.md`. Membership and known absences are recorded in
  `agents/doc-drift-agent/agent/readme-inventory.md`.
- It compares READMEs against one another (cross-project consistency), against repo
  state (paths, directory layout, `## Components` table, configured release units), and
  against the owning project's code/config as ground truth — reports drift with
  evidence, and proposes the **minimum README edit** as a PR.
- It may PR-edit **READMEs only**. It never edits code, config, scripts, or any
  non-README document.
- The doc-drift discipline is unchanged: factual mismatches only; no
  style/restructure/additions; evidence mandatory; one fix = the minimum edit.

## 4. Rules / Invariants

- The agent **MUST** confine edits to `README.md` files (root + per-project).
- The agent **MUST NOT** edit code, config, scripts, or CI. If the real fix is
  code-side, it proposes the README change and the maintainer decides on the PR.
- Every finding **MUST** carry both the doc-side claim and the contradicting
  evidence; an evidence-less finding is discarded.
- Every fix **MUST** be the minimum edit — no style, restructure, or additions.
- The agent **MUST NOT** merge or approve PRs.
- The agent **MUST NOT** open issues or any non-PR work item; findings are
  README-edit PRs.
- `readme-inventory.md` is the agent's own doc (hand-maintained); a top-level project
  with a README but no `## Components` row (or vice versa) is itself a finding.

## 5. Consequences

- Coverage is the README set — the bounded, high-signal surface. Project-`docs/` drift
  is **not** covered (a deliberate, revisitable choice after the scoped reversion).
- The runtime specs (`agent.md`, `drift-methodology.md`, `report-format.md`,
  `fix-pr-template.md`, `notification-spec.md`, `readme-inventory.md`) follow this ADR
  and are CI-synced to the live workspace on `trunk` merge.
- A nightly `/etc/cron.d` wrapper (`runtime/cron/doc-drift-cron.sh`) runs the agent with
  a 12h manual-run suppression gate and posts a compact Telegram notification.

## 6. Non-Goals

- Not editing code, config, or scripts — ever.
- Not auto-merging or auto-approving.
- Not introducing issues / queue machinery.
- Not changing the doc-drift discipline (factual mismatch, minimum edit).
- Not reviewing project `docs/` or any non-README documentation (parked with the scoped
  reversion; a future per-project approach is a separate decision).

## Revision history

- **v0.0.8 (2026-06-03):** reverted to **README-only** drift review. The scoped
  generalization (v0.0.6/0.0.7) and its orchestration (`ADR-001`, deleted) were built,
  deployed, and reverted — the codex CLI-harness compaction limit and structural
  variance between projects made a universal per-project `docs/**` scope unfit. The
  selection layer, orchestrator, scope registry, ADR-001, and scoped plans were removed;
  `agents/research/` notes are retained as the historical record. README-only is the
  stable resting scope; a future per-project review approach is a separate decision.
- **v0.0.7 (2026-06-03):** parked the universal one-scope-per-project model for scopes
  1..N in favour of per-project custom definitions. *(Superseded by v0.0.8.)*
- **v0.0.6 (2026-06-02):** generalised scope (READMEs → scope set incl. per-project
  `docs/`) and edit surface; restructured to the 6-section template. *(Superseded by
  v0.0.8.)*
- v0.0.5 and earlier: README-only drift review (see git history).
