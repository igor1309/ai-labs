---
date: 2026-06-02
author: Igor Malyarov
version: 0.0.7
status: accepted
accepted: 2026-06-03
source_intent: Automated Doc Drift Review and Fix Suggestions. Intent v0.0.4
description: "Use a specialized OpenClaw agent for SCOPED documentation drift review (cross-project READMEs + per-project docs); fixes are doc-edit PRs within a scope; never auto-merge. Amends the README-only scope of v0.0.5. v0.0.7: scopes 1..N are PARKED as a universal one-per-project glob and become per-project CUSTOM definitions, authored lazily along each project's own structure."
---

# ADR: Specialized OpenClaw Agent for Scoped Documentation Drift Review

> **Amendment note.** This revision (v0.0.6) generalises the agent's scope from
> **READMEs only** (v0.0.5 and earlier) to a **set of documentation scopes**, and
> expands the edit surface from README-only to a project's `docs/`. The original
> core — *use a dedicated agent; never auto-merge* — is unchanged. Restructured to
> the 6-section ADR template; the filename's version suffix has been dropped.
>
> **Amendment note (v0.0.7, 2026-06-03).** Scopes 1..N are no longer a **universal
> one-per-project** rule (`README + docs/**`). That abstraction is **parked**: it
> assumed every project shares one shape, but projects differ structurally, not just
> in size (agonara is admin/curator/student; oracle is backend/frontend), and the
> universal glob produced oversized, unauditable doc sets (agonara ≈ 213 k tokens —
> over the context budget on its own — and it swept in archived subtrees like
> `docs/plans/implemented/` that are not a live drift surface). Scopes 1..N are now
> **per-project custom definitions**, authored **lazily** (when a project enters the
> rotation) along that project's own structure. See §3. The doc-drift discipline,
> the edit surface (docs only), and *never auto-merge* are unchanged.

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
  repo; scopes 1..N are **per-project custom** definitions. A project is **not**
  mechanically one scope of `README + docs/**`; instead each project's docs are
  partitioned along **that project's own structure** (e.g. agonara →
  admin/curator/student; oracle → backend/frontend), into one or more scopes that
  each fit a single audit's context budget and exclude archived/historical subtrees
  (e.g. `docs/plans/implemented/`, `docs/archive/`). These definitions are authored
  **lazily** — when a project is brought into the audit rotation — not generated up
  front for all projects (which would re-introduce the parked universal abstraction).
- A project's README is reviewed in **both** scope 0 (cross-project consistency —
  README vs README) and its own project scope(s) (against that project's docs and
  state) — overlapping by design, with different lenses. The **precise document
  set per scope** (paths/globs/depth) is defined by the scope registry, not
  enumerated in this ADR.
- The agent reviews **one scope at a time**, comparing that scope's docs against
  one another and against repo state (including the project's code/config as
  ground truth), reports drift with evidence, and proposes the **minimum doc edit**
  as a PR.
- Within a scope, the agent may PR-edit **that scope's documentation** (`README.md`
  + `docs/`). It never edits code, config, or scripts.
- The **scope set** is **hand-curated** in the registry, not mechanically derived
  from the top-level project list. Its internal consistency is still auditable (a
  scope pointing at a removed project, or an empty scope, is drift), but "a project
  with no scope yet" is **not** drift — scopes are added per project as that project
  enters the rotation. The scope registry is the agent's own doc and is therefore
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
- The scope registry **MUST** be maintained as the agent's own doc and is
  **hand-curated** per project (not auto-derived from the project list). A scope
  pointing at a removed project, or an empty scope, is (PR-fixable) drift; a project
  not yet assigned any scope is **not** drift. Any coverage check **MUST NOT** assert
  one-scope-per-project (that enforced the parked universal model).

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

- **v0.0.7 (2026-06-03):** parked the universal "one scope per top-level project
  (`README + docs/**`)" model for scopes 1..N; replaced with **per-project custom
  scope definitions** authored lazily along each project's own structure, excluding
  archived subtrees. Registry is hand-curated (not auto-derived); coverage no longer
  asserts one-scope-per-project. Motivated by structural (not just size) divergence
  between projects and oversized universal doc sets (agonara ≈ 213 k tokens). Edit
  surface, discipline, and never-auto-merge unchanged. Orchestration substrate
  (`ADR-001`) is unaffected — it consumes whatever scope ids the registry declares.
- **v0.0.6 (2026-06-02):** generalised scope (READMEs → scope set incl.
  per-project `docs/`) and edit surface (README-only → a scope's docs);
  restructured to the 6-section ADR template; cross-referenced `ADR-001`.
  Supersedes the README-only scope of v0.0.5. Filename version suffix dropped.
- v0.0.5 and earlier: README-only drift review (see git history).
