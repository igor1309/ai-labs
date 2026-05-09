---
date: 2026-05-09
model: claude-opus-4-7
description: "READMEs the doc-drift-agent must inspect: root and one-level-below project READMEs, with cross-references and gaps relative to the root Components table"
---

# README Inventory

Enumerates every README the agent inspects on each run. Scope is fixed by `doc-drift-agent/docs/plans/doc-drift-agent.md` Task A2: the root `README.md` plus per-project READMEs found one level below the repo root. Deeper READMEs (e.g. `dragoman/docs/README.md`, `tools/wt/README.md`, `neris/packages/swift-neris/README.md`) are out of scope for the agent.

## Inventory

| Path | Owning component | Role | Cross-references into other READMEs |
|------|------------------|------|-------------------------------------|
| `README.md` | repo (ai-labs) | root | Names every project listed in the `## Components` table — `nexum`, `notio`, `notio-backend`, `notio-frontend`, `oracle`, `regentara`, `nomos`, `corpus-scout`, `web-scout`, `loki`, `claude-insights`, `session-digest`, `docker/langfuse`, `dragoman`, `clipdeck`, `doc-drift-agent` |
| `claude-insights/README.md` | claude-insights | project | None |
| `clipdeck/README.md` | clipdeck | project | None |
| `corpus-scout/README.md` | corpus-scout | project | None |
| `dev-skills/README.md` | dev-skills | project | None — explicitly notes the published `igor1309/skills` repo is kept without a top-level `README.md` |
| `doc-drift-agent/README.md` | doc-drift-agent | project | None |
| `gemini/README.md` | gemini | project | None |
| `nexum/README.md` | nexum | project | None |
| `notio/README.md` | notio (covers `notio-backend` and `notio-frontend` release units) | project | None |
| `oracle/README.md` | oracle | project | None |
| `regentara/README.md` | regentara | project | None |
| `session-digest/README.md` | session-digest | project | Mentions `nomos` (local proxy startup instructions) |
| `web-scout/README.md` | web-scout | project | None |

## Components-table coverage

Every row in the root `## Components` table must either (a) resolve to a project README at `<component>/README.md` or (b) be recorded below as a known absence the agent should treat as a drift candidate.

### Resolved

`claude-insights`, `clipdeck`, `corpus-scout`, `doc-drift-agent`, `nexum`, `notio`, `oracle`, `regentara`, `session-digest`, `web-scout`.

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
