# LAB-114: Agister works as the caller's hands, in the caller's place

The issue as filed, then the owner's decisions. This change is the ADR only (ADR-025, Proposed); the code that follows it is a later change.

Done gates (`agister/AGENTS.md`): this change adds an ADR and changes nothing the CLI or the settings offer, so the caller skill, `README.md`, the settings diagrams and the Pages settings view are unchanged. The code change that implements ADR-025 carries those gates, and the edits to `agister/AGENTS.md` and the caller skill that follow from it (no patch is applied after an `implement` run).

## Intent

Agister works as the caller's hands, in the caller's place. A caller (an agent owning a ticket and a worktree for it) hands Agister steps of its own work: implement, review, verify. These are not separate jobs elsewhere: they happen where the caller's work lives, with its files and its prepared environment (iFora: simulator binding, proxy, warm derived data), as if the caller did them, through Agister's agents, plans and records.

## Decision (owner, 2026-10-07)

A separation of concerns, decided as design, not on run data (Agister is new and in active development).

- Worktrees are the orchestrator's concern, not Agister's. Worktrees are the right practice for orchestrators, and the owner uses them a lot; but making them is the caller's job. Agister does no worktree work unless asked: it works where it is called. Setup/teardown commands could exist, but better not.
- "Unless asked" means the caller makes the worktree and points Agister at it (e.g. `--dir`). Agister keeps no checkout path of its own: all checkout code goes (create, setup, release, reap of checkouts, patch handoff).
- Dirtiness is a setting, per process. A writing process (implementor) is set to refuse a dirty worktree, failing fast. A read-only process (review) runs on a dirty worktree.
- Many ADRs need superseding: at least ADR-022, ADR-012, ADR-008, ADR-005, ADR-013, and the checkout parts of ADR-001, ADR-002, ADR-010 and ADR-024.

## Observed

2026-10-06, iFora (ios.config a7b57353) set `mode: in-place` in `.agister/workspace.yaml` so `implement` works in the hayward worktree. From then on every workflow is refused in that repo: `agister workflow show code_review` reports `REFUSED: workflow code_review uses process architecture_review_codex, which works in-place as the workspace settings say (mode: in-place), and a workflow's nodes never do` (and the same for the other three reviewers). Nothing overrides it: a workflow call takes no `--workspace`.

## Done when

An ADR records the decision and supersedes what it replaces; Agister works where it is called, with no workspace of its own unless asked; dirtiness refusal is per process; iFora's `code_review` runs in its worktree.
