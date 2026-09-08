---
date: 2026-09-08
model: claude-opus-5
description: "Restructure design: ticket-workflow delegates its implement-loop to a promoted execution-engine skill — two self-contained skills, contract-reviewed, post codex design pass"
---

# Restructure design — ticket-workflow ⇄ the execution engine

> **Derivation record for `execution-engine.md`.** The ADR is normative — it holds the decision
> and the invariants. This document explains *why* each contract exists and records the codex
> design passes that hardened them. On any conflict, the ADR wins.
>
> **Amendment 2026-09-07:** the committed brief the engine consumes is the committed `SPEC.md`
> with `NOTES.md` findings — intake no longer authors a brief document, and investigation amends
> none. See the amendment in `../adr/caller-seam.md`.
>
> **Amendment 2026-09-08:** `ticket-workflow` is retired and de-encapsulated. This document is
> design history and keeps the old names; for the caller-side skill each one maps to, see the
> 2026-09-08 amendment in `../adr/caller-seam.md`.

## Shape

Two self-contained skills, communicating only by a committed brief handed down and a
committed receipt read back. No skill references another's rules.

- **The execution engine** (promoted research-note → skill) — owns the whole middle:
  plan → implement → review → **verify**, and owns the falsification/evidence discipline.
  Consumes a caller-owned committed brief, returns a `done`/`stopped` **receipt**.
  Altitude-agnostic: `task is {}` is a parameter.
- **`ticket-workflow`** — intake → task definition → **delegate** → release → closure, plus
  the retros. Owns the *semantic acceptance contract*; performs no verification and references
  no engine rule.

The boundary that makes this work — and that a codex design pass (2026-07-23) forced into the
open — is **semantic vs mechanical**: the caller says *what* correct means; the engine derives
*how* to prove it.

## Ownership split — semantic vs mechanical

| Owner | Owns | Never touches |
|---|---|---|
| **ticket-workflow intake** | the semantic acceptance contract: defect, preconditions, authoritative sources, contradiction rulings, every acceptance criterion at product level | code, and maestro/mitm/sentinel/SHA choices |
| **ticket-workflow investigation** | the code-side reading of that contract: implicated surfaces and render points, and the check tier per criterion — amended into the brief | falsification machinery |
| **engine (Planner + Reviewer)** | the mechanics derived from that contract: verification path, sentinel grid, negative control, artifact provenance, SHA pinning | what the defect *is*; re-choosing a tier the brief names |

Amended 2026-08-06: the check tier and the implicated surfaces moved out of intake and out of the
engine into `investigation`, because each needs the code — see the amendment in
`execution-engine.md`. The seam is unchanged; it sits one stage later.

This is why "no cross-references" is real and not just relocated: intake needs **zero**
falsification discipline — it states semantic acceptance; the engine derives every mechanical
obligation. (Original brief had intake writing an "evidence-gated DoD" with mechanics baked in —
that would have forced intake to know the engine's rulebook. Rejected.)

## The load-bearing rule: review against the upstream contract, never self

The single most important correction from the codex pass. Self-referential review leaks
requirements:

- A self-consistent **brief** can drop an acceptance criterion, pick the wrong same-looking
  surface, or carry a bad contradiction ruling — and pass a review that only checks it against
  its own claims.
- A **plan** whose Planner drops a surface passes when each step is reviewed against *its own*
  DoD; the requirement silently evaporates and every downstream artifact is green.

**Rule: every derived artifact is reviewed against its upstream oracle — source → brief → plan →
step/proof — never against its own self-declared DoD.** An artifact's own DoD cannot establish
completeness; only traceability to the level above can. This changes the engine's `## review`
comparison oracle from "the artifact's DoD" to "the upstream contract".

- **brief-review** compares the brief against the immutable source snapshot, the design oracle,
  and the contradiction rulings; it rejects any acceptance claim omitted or untraceable to the
  source.
- **plan-review** compares the plan against brief + sources.
- **step/proof review** compares against plan + brief.

## The brief is caller-owned; the engine rejects, never repairs

The engine's fix loop routes to Planner/Implementer — neither owns the brief. So the engine
cannot repair a bad brief.

- The engine consumes a **committed, caller-owned** brief plus its source oracle (snapshot,
  design, rulings) as the brief-review substrate.
- An accepted brief finding returns **`stopped` with source evidence**; the caller
  (ticket-workflow) revises and starts a **linked new cycle**. The engine never edits the brief.
- brief-review is therefore an **entry gate that can only accept or reject-to-caller**, not a
  round in the internal fix loop.

## The handoff is a receipt, not a verdict

`done`/`stopped` alone lets a later commit or worktree switch ship an unverified tree (release
derives `EXPECTED_HEAD` from the current checkout — internal consistency, not equality with the
*verified* tree).

- The engine returns a **receipt**: verdict + brief SHA + verified code-tree SHA + evidence index.
- **Release accepts only a `done` receipt whose SHAs match current HEAD/tree**; any drift reopens.
- **`stopped` never advances to release** — it returns to intake or redelegation.

## Path/baseline: prove the harness before trusting a negative

Baseline (walk the path pre-fix) is the plan's first step — but a broken harness (dead proxy,
wrong entry, wrong surface) produces a false "does not reproduce", which wrongly bounces to intake.

- Planner grounding **proves reachability of the named surface and captures the oracle before
  baseline**; baseline is trusted only behind a path-validity proof.
- The **Planner gets its own `QUESTION FOR ORCHESTRATOR`** path (today only the Implementer has
  one — a real gap). Unresolved access (e.g. mitm proxy down — a user-owned process) uses that
  QUESTION and spends **no** review round.
- A grounding discovery that changes surface / preconditions / oracle / contradiction ruling
  **stops as spec drift** (back to the caller), it does not get silently absorbed.

## Lifecycle pieces that stay in ticket-workflow

- **Retros stay.** Work-end retro and the QA-calibration retro (QA misses → verification) run in
  ticket-workflow after each engine terminal. Dropping them would strand reusable recipes and let
  QA-detected gaps recur.
- **Two-tier learning resolves the gotchas drift:** the engine commits **ticket-local** gotchas to
  the ticket docs (for subagents in *this* run); the retro **promotes reusable** recipes/rules to
  their owning skill or AGENTS.md.
- **QA bounce = fresh linked cycle.** Engine terminals are immutable; a bounce never reopens a
  terminal tracker. Closure consults the latest cycle and requires its `done` receipt.

## Dispatch (the real cost of no-cross-reference)

With no cross-references, ticket-workflow cannot auto-invoke the engine; delegation is an
**explicit** dispatch.

- Ambient routing owns the sole edge: **ticket intents load ticket-workflow; an explicit
  committed-brief dispatch loads the engine.**
- The engine gets **no** generic ticket/verification trigger phrases — otherwise both owners load
  at once.
- Accepted cost: the intake→engine handoff is a deliberate command, not an autonomous call. This
  matches modular.md's "commands, not autonomous dispatch, are the entry surface for stages."

## Handoff seam (end to end)

task (defect + sources) → **intake** writes the semantic contract + immutable source snapshot →
**brief** committed → engine entry-gate **brief-review** against the source oracle (reject →
`stopped` → caller revises → linked cycle) → **Planner** derives path/oracle, proves reachability,
baseline as step 1 → per-step implement → **review against upstream contract** → engine returns a
**receipt** → **release** accepts only a `done` receipt matching HEAD → **closure** on QA verdict,
bounce = linked cycle → **retros** promote learning. (t-4 live session validates through
`orchestrator-brief → planner-brief → plan → per-step green commits` incl. a mid-step plan-revision
hand-back; the receipt/release/closure mechanics are not yet exercised by any run.)

## Status of the design

Codex design pass 2026-07-23 returned 8 fails + 1 warning against the first brief; all judged
accept (zero hand-waves) and folded above. The two-skill split survived; its contracts were the
thing that needed hardening.

**Implemented 2026-07-23** (commits `22d8ee8`..`d73be04`): the ADR is
`adr/caller-seam.md`; the live engine is
the execution engine's own skill folder. The transient
implementation plan was removed on completion per **dev-skills:skill-conventions**; this brief remains as design
history.

## Constraints (carry into execution)

- The engine doc is a terse orchestrator PROMPT for reasoning models, not a procedural script;
  edits stay one-or-two-line levers, not new sections/checklists.
- Two skills, no cross-references; a shared third rules-skill is the smell being removed. AGENTS.md
  ambient inheritance is acceptable for genuinely universal rules (e.g. SHA-pinning).
