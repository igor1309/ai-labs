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

Documents below a project's top level that are not in that project's `docs/` are out of scope. The precise paths/globs per scope are pinned here as the registry is built out during implementation.

## Scope 0 — README membership

| Path | Owning component | Role | Cross-references into other READMEs |
|------|------------------|------|-------------------------------------|
| `README.md` | repo (ai-labs) | root | Names every project listed in the `## Components` table — `nexum`, `notio`, `notio-backend`, `notio-frontend`, `oracle`, `reinix`, `nomos`, `corpus-scout`, `web-scout`, `loki`, `claude-insights`, `session-digest`, `docker/langfuse`, `dragoman`, `clipdeck`, `doc-drift-agent` |
| `claude-insights/README.md` | claude-insights | project | None |
| `clipdeck/README.md` | clipdeck | project | None |
| `corpus-scout/README.md` | corpus-scout | project | None |
| `dev-skills/README.md` | dev-skills | project | None — explicitly notes the published `igor1309/skills` repo is kept without a top-level `README.md` |
| `doc-drift-agent/README.md` | doc-drift-agent | project | None |
| `gemini/README.md` | gemini | project | None |
| `nexum/README.md` | nexum | project | None |
| `notio/README.md` | notio (covers `notio-backend` and `notio-frontend` release units) | project | None |
| `oracle/README.md` | oracle | project | None |
| `reinix/README.md` | reinix | project | None |
| `session-digest/README.md` | session-digest | project | Mentions `nomos` (local proxy startup instructions) |
| `web-scout/README.md` | web-scout | project | None |

## Components-table coverage

Every row in the root `## Components` table must either (a) resolve to a project README at `<component>/README.md` or (b) be recorded below as a known absence the agent should treat as a drift candidate.

### Resolved

`claude-insights`, `clipdeck`, `corpus-scout`, `doc-drift-agent`, `nexum`, `notio`, `oracle`, `reinix`, `session-digest`, `web-scout`.

### Sub-units covered by a parent README

- `notio-backend`, `notio-frontend` — both release units are documented inside `notio/README.md`. No standalone `notio/backend/README.md` or `notio/frontend/README.md`.

### Components without a top-level project README (drift candidates)

These directories appear in the root Components table but do not have a `<component>/README.md` at the inventory's scoped depth. The agent should flag any factual claim about them in the root README that no project README corroborates.

- `nomos` — no `nomos/README.md`.
- `loki` — no `loki/README.md`.
- `dragoman` — no `dragoman/README.md`. A `dragoman/docs/README.md` exists but is out of scope per the inventory rule above.
- `docker/langfuse` — no `docker/langfuse/README.md`.

### Project READMEs without a Components-table row

These project READMEs exist at the inventory's scoped depth but are not listed in the root `## Components` table. By design (per repo convention) some are listed in the root `## Structure` table instead, not Components — the agent should not flag them as drift unless a future change moves them into Components scope.

- `dev-skills/README.md` — repo convention: listed under root `## Structure`, not `## Components`.
- `gemini/README.md` — repo convention: listed under root `## Structure`, not `## Components`.

## Refresh policy

This inventory is hand-maintained. The agent regenerates the in-memory list from current repo state at every run; this document records the contract — what counts as in-scope, what counts as a known absence, what counts as a sanctioned omission. When a new top-level project lands or an existing one is renamed/removed, update the New Project Checklist surfaces (`README.md` Components table, `scripts/loc-dashboard.sh`, `docs/loc-dashboard.html`, project log) and this inventory in the same change set.
