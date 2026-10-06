---
date: 2026-09-08
model: claude-opus-5
description: "Delegate ticket-workflow's implement-loop (plan → implement → review → verify) to a separate, promoted execution-engine skill. Two self-contained skills split at semantic vs mechanical; the outer lifecycle stays soft."
---

# Delegate the implement-loop to an execution engine

## Decision

`ticket-workflow`'s **middle** — form the approach, implement, review, and verify — is delegated
to a separate multi-agent **execution-engine skill** (promoted from the
research note, now superseded by the skill and retained only in git history). `ticket-workflow` keeps the
**semantic ends**: intake, task definition, release, closure, and the retros.

The two skills are **self-contained and reference no rule of the other**. They communicate only by
a committed **brief** handed down and a committed **receipt** read back. The split is
**semantic vs mechanical**: the caller states *what* correct means; the engine derives *how* to
prove it.

- **ticket-workflow intake owns the semantic acceptance contract** — defect, preconditions,
  authoritative sources, contradiction rulings, and every acceptance criterion at product level.
  It owns **no** falsification mechanics.
- **ticket-workflow investigation owns the code-side reading of that contract** — the implicated
  surfaces and their render points, and the **check tier** each criterion will be proven at. It
  amends the brief with them; it owns no falsification machinery.
- **The engine owns the mechanics** derived from that contract — verification path, sentinel grid,
  negative control, provenance, SHA pinning — and the whole plan/implement/review/verify
  machinery. It owns **no** notion of what the defect *is*, and it does not re-choose a check tier
  the brief already names.

### Amendment 2026-08-06 — the check tier moved out of the engine

As first accepted, this ADR gave the engine the **judge tier** and gave intake the **implicated
surfaces**. Both moved to a new `investigation` stage, for one reason: choosing a tier and naming
a surface each require reading the code, and intake was thereby forced into a code sweep on every
ticket — including tickets whose request was too ill-formed to survive its own gate.

The semantic/mechanical seam itself is unchanged. What moved is where the seam sits: the caller
now hands down *what* must be true **and at which tier it will be proven**, and the engine derives
every mechanism below that. The engine still owns no notion of what the defect is.

### Amendment 2026-09-07 — the brief is the committed SPEC

Intake no longer authors a brief document; investigation amends none. The caller hands down the
committed artifacts: `SPEC.md` is the semantic contract the engine's "brief" names, and `NOTES.md`
carries investigation's findings as the code-location input; the snapshot and bundles remain the
sources. The brief/receipt seam and the engine's self-contained contract are unchanged — a receipt
that names a defect in the handed contract still returns to intake for a revised SPEC and a fresh
linked cycle. Architecture and QA authoring moved into the delegate stage's execution planning,
under their owning skills. Part of the ticket-workflow de-encapsulation
(`research/orchestration/ticket-workflow-de-encapsulation.md`).

## Relationship to `modular.md`

`modular.md` (2026-06-16) made the whole single-ticket lifecycle one **soft-orchestration**
umbrella and deliberately declined a deterministic engine: *"a rigid engine is premature."* That
judgment stands for the **outer** lifecycle, unchanged.

This ADR **scopes an exception**: the implement-loop is now bounded and adversarially structured
enough to warrant an engine. So the soft umbrella **delegates its middle to an engine and keeps
its ends soft**.

It **narrows exactly one** `modular.md` invariant — number 8, "intake is the only
boundary-crossing stage." Intake remains the only **source-ingress** boundary (loose reference in,
conforming snapshot out); the committed **brief/receipt** is a newly accepted **execution**
boundary. **All other `modular.md` invariants remain in force unless restated below.**

## Status

Accepted — 2026-07-23. Evolves (does not supersede) `modular.md`. **Implemented** in
`22d8ee8`..`f88484d`; the derivation record — why each contract below exists, and the codex design
passes that hardened them — is `research/execution-engine-derivation.md`.

**What is validated, precisely:** the live DBSNEW-17101 task-04 session (2026-07-23) drove
`orchestrator-brief → planner-brief → plan → per-step green commits`, including a mid-step
plan-revision hand-back. The **receipt, release-gating, and closure** mechanics below are **not
yet validated** — no cycle has produced a release-checkable receipt. Promotion activates in full
after one end-to-end cycle does.

### Amendment 2026-09-08 — the caller is the phase skills; this ADR moved here

`ticket-workflow` was de-encapsulated and retired. Wherever this ADR says
"ticket-workflow", read the phase skill that now owns that end: intake is
**ticket-intake**, investigation is **ticket-investigation**, and the delegate
stage that hands down the brief and reads the receipt back is
**ticket-implementation**. The seam itself is unchanged — what moved is which
skill stands on the caller's side of it.

The ADR now lives with the engine (**adversarial-cycle**) rather than the
caller, because the engine is the stable party: it is altitude-agnostic and the
caller is a parameter.

`modular.md` is retired with the umbrella. Its invariants 1, 2 and 7 fell and 4
fell in part; the "all other invariants remain in force" clause above therefore
binds only 3, 5, 6 and 8. Invariant 8, which this ADR narrows, is restated in
**ticket-intake**'s own skill; 3 is covered by
**dev-skills:skill-conventions**' duplication rule; 5 lives in
**ticket-release** and **ticket-closure**, 6 in **ticket-orchestrator**.

## Scope of this ADR — the seam only

Per `modular.md`'s no-duplication rule (a sibling's rules stay with their owner), this ADR records
**only the ticket-workflow ⇄ engine boundary**. The engine's **internal** contracts — review
against the upstream contract, baseline as plan step 1, brief-reject-not-repair, two-tier learning
— are owned by the engine skill and specified in the restructure brief; they are **not
restated here** as ADR-owned rules, so the two cannot drift.

The boundary contracts this ADR does own:

1. **Brief down, receipt up — the only execution boundary.** The caller commits a brief plus its
   source oracle; the engine returns a committed receipt. No shared mutable artifact, no rule
   reference crosses.
2. **A bad brief is rejected, never repaired.** The engine cannot fix a caller-owned brief; an
   accepted brief finding returns `stopped`, and the caller revises and starts a **linked new
   cycle**.
3. **The receipt is content-pinned across two repositories.** It records the brief **blob** SHA
   (stable even as later tracker commits advance the docs-repo HEAD), the verified **app-tree**
   SHA, and the **terminal docs commit** holding the evidence index. Release recomputes each
   against its **named repository and path**; only a `done` receipt whose recomputed SHAs match is
   releasable. `stopped` never advances.
4. **Persistence is caller-supplied.** The engine writes its brief, tracker, and gotchas to
   **caller-supplied run docs** beside the brief — not a hardcoded ticket-docs repo. A ticket
   folder is one caller-specific mapping; a non-ticket caller supplies its own. The caller owns
   promotion of reusable learning after a terminal.
5. **Engine terminals are immutable; QA bounce is a fresh linked cycle.** A bounce never reopens a
   terminal tracker. Closure consults the latest cycle and requires its `done` receipt.
6. **Dispatch is explicit skill invocation.** The engine's **frontmatter description** owns the
   exact trigger, which names a committed-brief path. This is explicit skill dispatch
   (a human issues it in a new turn after the brief commits), **not** a lifecycle-stage command and
   **not** an autonomous ticket/verification trigger. The engine carries no generic
   ticket/verification trigger phrases, or both owners would load at once.

## The membership test (scope), then the dispatch test (invoker)

Inherited from the retired `modular.md` (2026-06-16).

**1. Scope.** The engine is **out of the single-ticket umbrella** — altitude-agnostic
(`task is {}`) and reusable for any well-specified implementation task once persistence is
caller-supplied (contract 4). By the membership test it is a cross-cutting capability, like
`xcodebuild-runner`, and so a **standalone top-level skill**. Intake, task-definition, release,
closure, and retros remain single-ticket **stages** — each its own phase skill since 2026-09-08,
and all of them still outside the engine's scope.

**2. Dispatch.** Per contract 6: ticket intents load the lifecycle skills; the explicit committed-
brief trigger loads the engine. No autonomous edge crosses between them.

## Invariants

1. `ticket-workflow` owns the **semantic** stages (intake, task-definition, release, closure,
   retros) as resources under `phases/`; none is a top-level skill; it writes **no** falsification
   mechanics.
2. The **engine** owns plan/implement/review/verify **and** the falsification discipline, holds
   **no** definition of the defect, and is a standalone skill outside the umbrella.
3. **No cross-references, scoped:** neither skill's **SKILL.md or phase resources** cite the
   other's rules. This ADR records only the shared boundary (scope section); engine-internal rules
   stay solely in the engine skill. Universal rules (e.g. SHA-pinning) may live ambient in
   AGENTS.md; a shared third rules-skill is forbidden.
4. Communication is a **committed brief down, a committed receipt up** — the receipt content-pinned
   per contract 3. Never a shared mutable artifact or a rule reference.
5. The **task/brief is the single point of failure by design**; brief-review against the source
   oracle is its guard, and the engine rejects a bad brief rather than repairing it (contract 2).
6. **Engine terminals are immutable;** a QA bounce is a fresh linked cycle; closure requires the
   latest cycle's `done` receipt (contract 5).
7. The engine is invoked by **explicit committed-brief dispatch only**, via its frontmatter trigger
   (contract 6); it carries no autonomous ticket/verification triggers.
8. **Engine persistence is caller-supplied run docs** (contract 4); the ticket folder is one
   caller mapping, and reusable learning is promoted by the caller's retro, not the engine.
