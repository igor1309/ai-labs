---
date: 2026-06-03
model: claude-opus-4-8
description: "Session handoff for the traceability-review skill — current state, gotchas, and how to resume in a fresh session"
---

# Traceability Review — Handoff

Read this first in a new session, then `SKILL.md` (the method), `TODO.md` (what's
left), and `references/agonara-case-study.md` (worked example + lessons).

## State

- Branch **`traceability`**, unpushed, working tree clean. Skill at **v0.9.0**.
- The **`intent → ADR → spec → tests` pipeline is implemented end to end** — seven
  passes, each validated on Agonara (qualitative-first run + variance):
  1. intent×intent (v0.0.1) · 2. intent→ADR per-module (v0.2.0) ·
  3. ADR×ADR cross-module (v0.3.0) · 4. allocation completeness (v0.4.0) ·
  5. ADR→spec per-module (v0.7.0) · 6. spec↔tests per-module (v0.8.0) ·
  7. upward orphan check, ADR→intent per-module (v0.9.0).
- v0.5/0.6 were the **consolidation refactor** (intent-driven lean, project
  specifics lifted to the case study, evals reframed as a regression harness).
- One reference output per pass lives in `agonara/docs/traceability-reviews/`;
  `evals/evals.json` has eval ids 1–7 (one per pass).

## Gotchas (the non-obvious things that bite)

- **cwd / worktree hazard (#1).** Branch `traceability` is checked out at
  `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs` (the main checkout) —
  **not** the harness's "primary working directory", which is a *stale* worktree
  (`.claude/worktrees/happy-prancing-dewdrop`, on its own branch at a pre-session
  commit). Run main-thread git/file ops at `…/ai-labs/ai-labs`. **Subagents
  inherit the worktree cwd**, so give them **absolute paths** to inputs and have
  them write to **`/tmp`** (experiments) or absolute real-tree paths (references).
  `git worktree list` confirms the layout.
- **Method pattern.** Every pass = a **deterministic complete matrix**, rows
  pinned to the source's own units (don't sub-split), findings derived
  mechanically. The residual variance is always a **bounded disposition call**
  (loss-vs-uncovered, deferred-vs-missing, covered-vs-untested, drift-count,
  derived-vs-orphan). Evals assert the *stable* parts and **leave the disposition
  unpinned**. One twist for the orphan check: its rows pin to **ADR prose
  decisions, which carry no IDs**, so even the row *count* is soft (63/63/53 over
  three runs) — the eval pins the row-generation rule and the 0-orphan verdict,
  not a number.
- **Evals are a regression harness, not a living contract** (see
  `evals/README.md`). Reference outputs are perishable, provenance-stamped
  snapshots; when Agonara's docs change, re-run + human-confirm, don't "fix" the
  skill to satisfy a stale fixture.
- **spec↔tests:** discover test scope across the *whole* suite (clauses are
  tested across many files); titles only via **`grep`** (a written script adds
  cost with no gain — measured); never run tests; a negative/"does-not" guarantee
  no test names is an open question, not an untested finding.

## Runtime

- Worker passes: `general-purpose` subagent, absolute paths, ~50–110k tokens each
  (allocation/ADR×ADR ~93–110k; per-module intent→ADR / ADR→spec / spec↔tests
  ~56–84k). Run qualitative-first, then 2 variance runs, then commit the version.
- Grounded web research: the **`researcher`** agent or **`/research`** command
  (sufficiency budget baked in — stops at enough, doesn't chase paywalls).
- Commit rhythm per pass: skill (version-bumped) + reference output + eval, as
  separate commits; keep `git add` and `git commit` in separate calls.

## What's next (see TODO.md)

- **Umbrella ledger** — aggregate findings across passes into what a human
  resolution session works from. Now the clear next step.
- **Spec-level upward orphan check** (extension) — pass 7 covers ADR→intent; the
  spec→ADR/intent counterpart (does every spec clause trace back) is the natural
  follow-on if spec-level scope creep needs guarding.
- **Parked:** publishing workflow (marketplace.json/plugin.json/log/PR per
  `dev-skills/.claude/CLAUDE.md`) when ready to merge; hosting/triggering
  (single vs multi agent); the CUR-13 acceptance-time-vs-pre-acceptance refinement.

## Not done

- Nothing is **pushed or merged** — the whole effort sits on `traceability` (30
  commits ahead of trunk). Publishing is a deliberate later gate.
- spec↔tests + all passes are validated on **one module** (Corpus/Curator) and
  the intent/ADR layers; running them across the other Agonara modules is real
  work the passes are ready for, but it's Agonara *remediation*, not tooling.
