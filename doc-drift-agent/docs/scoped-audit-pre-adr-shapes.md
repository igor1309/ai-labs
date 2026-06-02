---
date: 2026-06-02
model: claude-opus-4-8
description: "Pre-ADR shapes for the scoped doc-drift audit: three separable concerns (parameterized single-scope worker, external orchestrator, concise run rendering), their committed positions, delivery order, deferred work, and rejected alternatives."
---

# Doc-Drift Scoped Audit — Pre-ADR Shapes

Companion to `scoped-audit-intake.md` (the intent). That brief captures *what*
and *why*; this captures the *architectural shapes* the design discussion
converged on, to feed the ADR(s). Nothing here is built yet.

The work factors into **three separable concerns** — and the separation is also a
**delivery order**, because they differ sharply in risk and coupling.

## Shape 1 — Scoped agent run (the worker)

**Parameterize the existing agent; do not clone it.** A clone per scope buys N
workspaces and N syncs for no gain — the work is identical, only the input
differs. The orchestrator hands the agent a **scope contract** and the agent
stays blind to scheduling, persisted state, and every other scope:

- `id` — e.g. `readmes`, `oracle`.
- **the document set + how to find it** — globs/roots. Deliberately *not* "a
  project": **scope 1 (all READMEs) is inherently cross-project / multi-document**,
  so the unit is "a set of docs reviewed together." Per-project scopes are the
  narrow case; the cross-project README scope is the broad one.
- **the truth-sources to check against** — sibling docs, repo state, the
  project's own code/config.

The worker audits that document set per the doc-drift discipline and exits. It is
the stable contract the orchestrator (Shape 2) sits behind.

## Shape 2 — Orchestrator

Owns **scope selection, cadence, state, and eligibility**. Hard requirement: it is
**tested, version-controlled code with the cron wrapper doing only I/O** — not
decision logic glued into a hand-deployed bash wrapper.

- **Target design** (the direction, not the first cut): change-eligibility via a
  **nightly `git diff`** against each scope's `last_audited_commit` (no CI
  dependency — git history is the change source), **plus** a **staleness
  rotation** (audit scopes not seen in N days even if unchanged, to catch
  baked-in drift and re-check with improved tooling), drained in an **off-peak
  night window** under a **per-night budget** (overflow rolls over; changed >
  stale).
- **Staging:** start the orchestrator trivial (even a fixed/manual scope list),
  but **behind the Shape-1 contract**, so it can grow *trivial → rotation →
  change+stale* **without ever touching the worker**. That independence is the
  payoff of the separation.
- **Eligibility is decoupled from execution.** A change makes a scope *eligible*;
  it never *runs* on push. Execution is always the controlled night window.

## Shape 3 — Run rendering (the message)

The Telegram message must be **concise and actionable, not bloated prose**:
per-finding one-liners (category · doc · one-line suggested fix · PR link), never
the full evidence dump (evidence lives in the PR). This shape is **independent of
Shapes 1 and 2** and fixes the exact symptom that started this work, so it
**ships first**, on its own, at the lowest risk.

## Delivery order

**#3 → #1 → #2.**

- **#3 first** — cheap, fixes the reported pain, no architecture, no new
  automation to trust.
- **#1 next** — the stable scope contract.
- **#2 last** — grows behind that contract, built as tested code; the deferred
  complexity lands incrementally and verifiably.

## Doc-drift invariant (unchanged, governs all three)

Drift = "the doc says X; reality is Y." The fix is always a **minimal edit to the
document**; code/other-docs/repo-state are checked against, never edited. No
restructure/style/additions. **Every finding is a doc edit** — there is no
code-side branch and no issue machinery.

## Rejected / dead (do not resurrect without new reason)

- **Round-robin as a "seed" for the eligibility engine** — wrong data model
  (cursor vs eligible-set); partly throwaway.
- **Scheduling fixes the bloated message** — it does not; that is Shape 3
  (rendering), orthogonal to scheduling.
- **Cloning the agent per scope** — N workspaces/syncs for zero gain.
- **CI/push as the audit trigger** — push enqueues eligibility at most; it never
  executes. Git history is the change source.
- **Widening the edit surface in one big pass** (edit anything, anywhere) — wrong
  blast radius.
- **Single-file allowlist expansion** — an endless per-file race.

## Open knobs (for the ADR / planning, not blocking the shapes)

- Staleness window (e.g. 1 vs 2 weeks; per-scope overridable).
- Per-night budget (max scopes/night).
- Night window (the doc-drift slot is 01:00 UTC today — confirm it is actually
  this VPS's idle hour).
- README cross-project scope cadence (every night, or only on structural change).
- Optional re-audit throttle (min interval so a daily-changing project is not
  audited every night).
- Where the scope registry lives + the meta-scope that audits it
  (`readme-inventory.md` generalizes into it).

## Governance

Intent and ADR are amended **first** (`adr-governance`-gated); methodology,
`agent.md`, templates, `report-format.md`, and `notification-spec.md` follow. The
README-only boundary is pinned in five places. The current ADR is `proposed`
(v0.0.5). This change may warrant splitting into per-shape ADRs given the three
concerns are independently deliverable.
