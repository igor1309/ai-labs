---
date: 2026-06-03
model: claude-opus-4-8
description: "README inventory for the doc-drift-agent: which READMEs are in scope (root + per-project), cross-reference notes for the Doc-to-Doc lens, and the known absences to ignore"
---

# README Inventory

The set of READMEs the agent reviews each run, plus the known absences it must not flag. The agent reviews the whole set in one pass.

## README membership

In scope:

- The root `README.md`.
- Every top-level project's `README.md` (one level below the repo root).

A project README is discovered from the working tree at `/home/openclaw/ai-labs`; do not hard-code the list here (it drifts). The root `README.md` `## Components` table is the cross-check for which projects should have a README.

Out of scope: non-README documents (`docs/**`, specs, ADRs, plans), and anything under excluded directories (`node_modules/`, `vendor/`, `.build/`, `worktrees/`, `dist/`, `.wrangler/`).

## Cross-reference notes (for the Doc ↔ Doc lens)

- The root `README.md` `## Components` table names the projects; a Components row with no corresponding project README (or a project README with no row, unless sanctioned below) is drift.
- `session-digest/README.md` mentions `nomos` (local proxy startup).
- `dev-skills/README.md` notes the published `igor1309/skills` repo is kept without a top-level README.

## Components-table coverage

- **Sub-units under a parent README:** `notio-backend` / `notio-frontend` are documented inside `notio/README.md`; there are no standalone sub-unit READMEs.
- **Sanctioned omissions (in `## Structure`, not `## Components`):** `dev-skills`, `gemini` — listed under the root `## Structure` table by repo convention; not flagged as drift unless moved into Components scope.

## Refresh policy

This inventory is hand-maintained. When a new top-level project lands (or one is renamed/removed), update the cross-reference notes here alongside the other New Project Checklist surfaces (`README.md` `## Components` table, `scripts/loc-dashboard.sh`, `docs/loc-dashboard.html`, project log). A top-level project that has a `README.md` but no `## Components` row (or vice versa) is itself reportable drift.
