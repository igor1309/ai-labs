---
date: 2026-06-27
model: gpt-5
description: "Adversarial review of the student-api-program-materials branch documentation changes against Agonara ADR, spec, review, and doc-maintenance requirements."
---

# Student API Program Materials - Adversarial Review

## Scope

Reviewed the branch diff against `origin/trunk`:

- `agonara/architecture.html`
- `agonara/backlog/README.md`
- `agonara/backlog/material-content.md`
- `agonara/docs/adr/adr-021-material-content-storage-and-role-gated-reading.md`
- `agonara/docs/adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md`
- `agonara/docs/log.md`
- `agonara/docs/pre-adr/accepted-entity-withdrawal_pre_adr.md`
- `agonara/docs/pre-adr/material-content-access_pre_adr.md`
- `agonara/docs/specs/material-content-storage.md`

The review consulted the repo guidance for session start, collaboration preferences, process gates, ADR governance, spec writing, architecture document review, and doc maintenance.

## Findings

### Undefined response type

- **Verdict:** fail.
- **Location:** `agonara/docs/specs/material-content-storage.md:106`.
- **Why:** The HTTP table returns `SourceContentSummary`, but the spec never defines that type. The `spec-writing` skill requires public interfaces to define function signatures and input/output shapes. `rg SourceContentSummary` finds only this endpoint row.
- **Fix:** Add a `SourceContentSummary` type under Read shapes, or change the response to an already-defined shape such as a redacted source-content projection.
- **Test impact:** Add or update the HTTP test for `PUT /sources/{sourceId}/content` to assert the exact response projection.

### Admin modeled as effective participation

- **Verdict:** fail.
- **Location:** `agonara/docs/specs/material-content-storage.md:165`.
- **Why:** The spec says material content reads require "effective Student, Program Curator, or Admin participation." ADR-002 and ADR-007 define effective participation only for `Student` and `Program Curator`; `Admin` is instance-scoped operational authority and does not become product participation.
- **Fix:** Rewrite the authorization rule as "effective Student or Program Curator participation, or effective Admin authority if this spec intentionally allows Admin inspection," and make the route table use the same wording.
- **Test impact:** Update the HTTP authorization test to name the three cases separately: Student participation, Program Curator participation, and Admin authority.

### Promoted pre-ADR still presents open questions

- **Verdict:** fail.
- **Location:** `agonara/docs/pre-adr/accepted-entity-withdrawal_pre_adr.md:111` and `agonara/docs/pre-adr/accepted-entity-withdrawal_pre_adr.md:130`.
- **Why:** The promotion note says ADR-022 resolves the open questions, but the document still has a `## Open questions` section with those same questions presented as unresolved. That creates an internal contradiction in the changed document.
- **Fix:** Rename the section to `## Resolved questions` and replace each question with ADR-022's answer, or remove the section after the promotion note.
- **Test impact:** Docs-only; inspect the pre-ADR for no remaining unresolved/open wording after the promotion note.

### Log records process history instead of outcomes

- **Verdict:** warning.
- **Location:** `agonara/docs/log.md:39`.
- **Why:** The 2026-06-27 log entries include session/process history and intermediate version movement such as `arch-doc-review pass fixed`, `v0.1.0 -> v0.2.0`, and "ready to promote." `.agents/doc-maintenance.md` requires concise, outcome-focused log entries.
- **Fix:** Collapse the entries into outcome bullets, for example ADR-021/spec, ADR-022/backlog, and any remaining pre-ADR reasoning note.
- **Test impact:** Docs-only; inspect the log for reverse chronological order and concise outcome-focused entries.

### ADR headings do not match the governance template exactly

- **Verdict:** warning.
- **Location:** `agonara/docs/adr/adr-021-material-content-storage-and-role-gated-reading.md:10` and `agonara/docs/adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md:10`.
- **Why:** ADR governance says each ADR should follow exactly the six-section structure `Executive Summary`, `Context`, `Decision`, `Rules / Invariants`, `Consequences`, `Non-Goals`. These ADRs use lowercase variants for several headings. Nearby ADR-019 and ADR-020 use the exact capitalization from the template.
- **Fix:** Rename the headings in both ADRs to match the template exactly.
- **Test impact:** Docs-only heading inspection.

## Verification

- `git diff --name-status origin/trunk...HEAD` - confirmed review scope.
- Read `dev-skills/public/using-dev-skills/SKILL.md`, `.agents/collaboration-preferences.md`, `dev-skills/public/process-gates/SKILL.md`, `dev-skills/public/arch-doc-review/SKILL.md`, `dev-skills/public/adr-governance/SKILL.md`, `dev-skills/public/spec-writing/SKILL.md`, and `.agents/doc-maintenance.md`.
- Read ADR governance references for ADR structure and review standard.
- `git diff --check origin/trunk...HEAD` - passed.
- Link, front-matter, and single-H1 checks over the changed Markdown files - passed.
