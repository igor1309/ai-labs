---
date: 2026-06-02
model: claude-opus-4-8
description: "Intake brief: introduce a scope model to doc-drift-agent (cross-project READMEs + one scope per top-level project, one scope per run). Orchestration machinery is an open ADR-level decision still under discussion."
---

# Doc-Drift Scoped Audit — Intake Brief

## Status

The scope **model** is agreed (below). The **orchestration machinery** — how
scopes are sequenced over time — has since been shaped into three separable
concerns; see `scoped-audit-pre-adr-shapes.md`.

## Problem

doc-drift was deliberately scoped to READMEs — the biggest surface pain, with a
bounded reach — as one of the first OpenClaw agents. But it keeps surfacing
valuable observations *outside* that single scope, with no machinery to route
them, so they pile into one undifferentiated, non-actionable Telegram blob that
the maintainer is overwhelmed by and ignores. The bloat is a symptom of having a
**single implicit scope**, not just of formatting.

Widening the agent's reach in one big pass (edit anything, anywhere) is the wrong
fix — it increases blast radius. The right direction is **many well-defined
scopes**, audited **one at a time**.

## The model (agreed)

- **Scope 1 — all READMEs** across the whole repo: cross-project consistency.
  This is today's behavior.
- **Scopes 2..N — one per top-level project**, each covering that project's docs
  (its `README.md` **and** its `docs/`).
- The agent processes **one scope per run**, so its context stays bounded and
  each run's output is focused and actionable — never a blob.
- **Per-scope output:** minimal **doc-edit PRs** under the doc-drift discipline
  (factual mismatches only, minimum edit, no restructure / style / additions).
- The **scope set is derived, not invented**: the repo already defines its
  top-level projects (the New Project Checklist surfaces — `loc-dashboard.sh`
  `known` list, root `README.md` Components / Structure). `readme-inventory.md`
  generalizes into that scope definition.
- **Meta-scope:** the scope set's own consistency is auditable — a top-level
  project with no scope, or a scope pointing at a removed project, is drift. This
  subsumes the old dead-end (a stale `readme-inventory.md` the agent couldn't
  fix): the registry is doc-drift's own doc, so it is now fixable via PR.

## Doc-drift invariant

The doc-drift discipline (from the `doc-drift-audit` skill) is unchanged: fixes
are minimal edits to the **document**; code / other docs / repo state are checked
against, never edited; every finding is doc-fixable; no issue machinery. Stated
authoritatively in `scoped-audit-pre-adr-shapes.md` → "Doc-drift invariant".

## Touches

The change ripples through the doc-drift document stack — intent, ADR,
`drift-methodology.md`, `agent.md`, the fix-PR template, `report-format.md`,
`notification-spec.md`. Governance and amend-order (`adr-governance`-gated; intent
and ADR amended first; the README-only boundary pinned in five places) are
detailed in `scoped-audit-pre-adr-shapes.md` → "Governance".

## Design decision (shaped → see pre-ADR shapes)

The vision shift — from a **one-shot scheduled agent** to a **set of scopes
audited one at a time**, with the agent reduced to a **stateless single-scope
worker** — was discussed and has converged into three separable concerns: a
parameterized worker, an external orchestrator, and concise run rendering. The
committed positions, delivery order (rendering → worker → orchestrator), deferred
work, and rejected alternatives are captured in `scoped-audit-pre-adr-shapes.md`.

## Corrections logged during intake

- An earlier framing ("the code is the truth, so the finding is non-doc-fixable,
  so open an issue") was a category error for doc drift and has been dropped.
  Every scoped finding is a doc-edit PR; no issue machinery is implied by the
  model.

## Open (not blocking the model)

- Cadence / dispatch knobs (staleness window, nightly budget, night hour, README
  scope cadence) — enumerated in `scoped-audit-pre-adr-shapes.md`, decided at ADR
  / planning time.
