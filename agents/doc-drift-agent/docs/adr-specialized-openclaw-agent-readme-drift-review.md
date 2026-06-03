---
date: 2026-06-02
author: Igor Malyarov
version: 0.0.6
status: accepted
accepted: 2026-06-03
source_intent: Automated Doc Drift Review and Fix Suggestions. Intent v0.0.4
description: "Use a specialized OpenClaw agent for SCOPED documentation drift review (cross-project READMEs + per-project docs); fixes are doc-edit PRs within a scope; never auto-merge. Amends the README-only scope of v0.0.5."
---

# ADR: Specialized OpenClaw Agent for Scoped Documentation Drift Review

> **Amendment note.** This revision (v0.0.6) generalises the agent's scope from
> **READMEs only** (v0.0.5 and earlier) to a **set of documentation scopes**, and
> expands the edit surface from README-only to a project's `docs/`. The original
> core — *use a dedicated agent; never auto-merge* — is unchanged. Restructured to
> the 6-section ADR template; the filename's version suffix has been dropped.

## 1. Executive Summary

Use a dedicated OpenClaw agent to detect **documentation drift** across `ai-labs`
and propose fixes as PRs. Documentation is reviewed in **scopes**: scope 0 = all
READMEs (cross-project consistency); scopes 1..N = one per top-level project,
covering that project's `README.md` and `docs/`. Within a scope the agent may
PR-edit that scope's documentation — never code/config. The doc-drift discipline
(factual mismatch only, minimum edit, no style/restructure) and the
never-auto-merge rule are unchanged. Orchestration and observability of scoped
runs are owned by a separate ADR (`docs/adr/agents/ADR-001-scoped-agent-orchestration-and-observability.md`),
which is predicated on this decision.

## 2. Context

`ai-labs` is a mono-repo of many projects; each has documentation (a README and,
mostly, a `docs/` tree) plus a root README. Docs drift from one another and from
repo state. A dedicated OpenClaw agent already exists; READMEs were its original,
deliberately-bounded scope — the biggest surface pain. That single scope proved
too narrow: the agent surfaces valuable observations about project docs it may not
act on, and one undifferentiated pass produces unfocused, ignorable output.

Constraints:

- Reuse the existing OpenClaw instance.
- The maintainer reviews and merges; the agent never merges or approves.
- Reviews must stay focused — bounded per scope.

Rejected alternatives:

- README-only forever — leaves project-doc drift homeless.
- Edit anything, anywhere in one pass — wrong blast radius.
- A single-file allowlist that grows file-by-file — an endless race.

## 3. Decision

Use a specialized OpenClaw agent for **scoped documentation drift review**:

- Documentation is partitioned into **scopes**: scope 0 = all READMEs across the
  repo; scopes 1..N = one per top-level project, covering that project's
  `README.md` and `docs/`.
- A project's README is reviewed in **both** scope 0 (cross-project consistency —
  README vs README) and its own project scope (against that project's docs and
  state) — overlapping by design, with different lenses. The **precise document
  set per scope** (paths/globs/depth) is defined by the scope registry, not
  enumerated in this ADR.
- The agent reviews **one scope at a time**, comparing that scope's docs against
  one another and against repo state (including the project's code/config as
  ground truth), reports drift with evidence, and proposes the **minimum doc edit**
  as a PR.
- Within a scope, the agent may PR-edit **that scope's documentation** (`README.md`
  + `docs/`). It never edits code, config, or scripts.
- The **scope set** is derived from the repo's top-level projects; its own
  consistency is auditable (a project with no scope, or a scope for a removed
  project, is drift). The scope registry is the agent's own doc and is therefore
  PR-fixable.
- The doc-drift discipline is unchanged: factual mismatches only; no
  style/restructure/additions; evidence mandatory.

## 4. Rules / Invariants

- The agent **MUST** review one scope per run and confine edits to that scope's
  documentation (`README.md` + `docs/`).
- The agent **MUST NOT** edit code, config, scripts, or CI. If the real fix is
  code-side, it proposes the doc change and the maintainer decides on the PR.
- Every finding **MUST** carry both the doc-side claim and the contradicting
  evidence; an evidence-less finding is discarded.
- Every fix **MUST** be the minimum edit — no style, restructure, or additions.
- The agent **MUST NOT** merge or approve PRs.
- The agent **MUST NOT** open issues or any non-PR work item; findings are
  doc-edit PRs.
- The scope registry **MUST** be maintained as the agent's own doc; scope-set
  drift is itself a (PR-fixable) finding.

## 5. Consequences

- Coverage broadens from READMEs to all project docs, partitioned into scopes —
  closing the "homeless project-doc observation" gap.
- The places that pinned "README-only" follow this ADR (they do not lead): the
  **source intent** leads, then the runtime specs (`agent.md`,
  `drift-methodology.md`, `fix-pr-template.md`, `report-format.md`,
  `notification-spec.md`) and `readme-inventory.md` → the scope registry. Because
  those runtime specs are CI-synced **live** inputs, the one hard rule is that they
  **reach the live agent only together with the worker, scope registry, and
  orchestrator — never ahead of them.** The clean way to satisfy that is to land
  the whole scoped model — specs + worker + orchestrator, with Lobster enabled and
  verified — as **one coherent change**, rather than staging the specs separately.
- **Orchestration & observability** of scoped runs (how/when scopes run, run
  outcomes) are **out of scope here** and owned by `ADR-001`, which is predicated
  on this decision being accepted first.
- Tradeoff accepted: a larger audited surface and edit surface, bounded by
  one-scope-per-run and the unchanged minimum-edit discipline.

## 6. Non-Goals

- Not editing code, config, or scripts — ever.
- Not auto-merging or auto-approving.
- Not introducing issues / queue machinery.
- Not changing the doc-drift discipline (factual mismatch, minimum edit).
- Not defining orchestration, scheduling, or observability (owned by `ADR-001`).
- Not defining notification rendering (Shape 3).

## Revision history

- **v0.0.6 (2026-06-02):** generalised scope (READMEs → scope set incl.
  per-project `docs/`) and edit surface (README-only → a scope's docs);
  restructured to the 6-section ADR template; cross-referenced `ADR-001`.
  Supersedes the README-only scope of v0.0.5. Filename version suffix dropped.
- v0.0.5 and earlier: README-only drift review (see git history).
