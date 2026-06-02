---
date: 2026-05-09
model: claude-opus-4-7
description: "Scope registry for the doc-drift-agent: the audit scopes (cross-project READMEs + one per top-level project's docs) and the documents each covers. Generalised from the original README inventory."
---

# Scope Registry

The registry of audit **scopes** and the documents each one covers. The agent audits one scope per run (the runtime provides the active scope). Generalised from the original README inventory.

## Scopes

- **Scope `readmes` (cross-project READMEs)** — the root `README.md` plus the per-project READMEs one level below the repo root (enumerated in `## Scope 0 — README membership` below). Lens: README ↔ README consistency.
- **Scope `<project>` (one per top-level project)** — that project's `README.md` and its `docs/` tree. Lens: the project's docs ↔ its repo state and own code.

Documents below a project's top level that are not in that project's `docs/` are out of scope.

## Machine-readable registry

The authoritative scope list lives in **`doc-drift-agent/agent/scope-registry.json`** — `scopes.readmes` (the cross-project README set) plus one entry per top-level project (`docs`: `README.md` + `docs/**`), and `excludedTopLevel` (repo infra that is not an audited project). It currently holds **scope 0 + 22 project scopes**. The worker resolves the active scope's document set from this file; the orchestrator selects among these scopes.

`doc-drift-agent/tests/scope-registry.test.js` keeps it honest: a coverage check derives the top-level projects-with-docs from the working tree and fails if a project has no scope (or a scope points at a removed project) — the meta-scope made enforceable. The prose tables below remain as scope-0 detail and the known-absence record.

## Scope 0 — README membership

Scope 0's authoritative membership is `scope-registry.json` → `scopes.readmes` (the root `README.md` plus every top-level project README). The coverage test keeps it in sync with the tree, so it is not re-listed here.

Cross-reference notes worth keeping (for the Doc ↔ Doc lens):

- The root `README.md` `## Components` table names the projects; a Components row with no corresponding project README (or a project README with no row, unless sanctioned below) is drift.
- `session-digest/README.md` mentions `nomos` (local proxy startup).
- `dev-skills/README.md` notes the published `igor1309/skills` repo is kept without a top-level README.

## Components-table coverage

- **Sub-units under a parent README:** `notio-backend` / `notio-frontend` are documented inside `notio/README.md`; there are no standalone sub-unit READMEs.
- **Sanctioned omissions (in `## Structure`, not `## Components`):** `dev-skills`, `gemini` — listed under the root `## Structure` table by repo convention; not flagged as drift unless moved into Components scope.
- **Scope-set drift is enforced, not hand-listed:** every top-level project with a README/`docs/` must have a scope, and every scope must map to an existing project. `doc-drift-agent/tests/scope-registry.test.js` fails otherwise — superseding the old hand-maintained "known absences" list, which had gone stale (`nomos`, `loki`, `dragoman` now have READMEs and scopes).

## Refresh policy

The scope set lives in `scope-registry.json` and is enforced by the coverage test. When a new top-level project lands (or one is renamed/removed), update the registry — the test fails until you do — alongside the other New Project Checklist surfaces (`README.md` Components table, `scripts/loc-dashboard.sh`, `docs/loc-dashboard.html`, project log).
