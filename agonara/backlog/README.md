---
date: 2026-06-20
model: gpt-5
description: "Index of Agonara's forward-task backlogs, split by topic under backlog/."
version: 0.1.0
---

# Backlog

Forward tasks only — never session status, done-markers, per-item progress, or
findings. Completed work drops out of the list; its record lives in git history,
the produced artifacts, and `docs/log.md`.

Backlogs are split by topic so each concern stays discoverable on its own:

- [`dev-skills.md`](dev-skills.md) — agent process, skill, and toolchain
  improvements.
- [`skills.md`](skills.md) — the BYOA operator-skill product: distribution,
  versioning, and discovery of the per-role operator skills.
- [`agent-connectivity.md`](agent-connectivity.md) — making an instance reachable
  by the agents people actually use (Telegram bots, Claude Code on web/app, other
  MCP or HTTP agents).
- [`workflow-calibration-gaps.md`](workflow-calibration-gaps.md) — calibrating the
  `traceability-review` dynamic workflow, using Agonara as the eval corpus.
- [`material-content.md`](material-content.md) — storing material text and serving it
  role-gated (ADR-021 + spec): deletion decision, implementation, product docs, skills.

Promote a topic to its own `backlog/<topic>.md` file when it is a distinct
concern that has reached roughly three or more items or is clearly going to grow;
keep small or uncategorized items in this index until then.

## Uncategorized items

Single items not yet promoted to a topic file.

- **Program lifecycle: archival / deletion / ownership transfer.** Still not
  exposed (`docs/specs/corpus-storage-and-curator-acceptance-api.md` #65/#66;
  `corpus-storage-and-curator-acceptance-first-slice.md` #37/#44); needs its own
  ADR for audit-preserving semantics. (The **source-deletion** half of the former
  item is now decided in
  `docs/adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md` — two-tier
  hard-delete-unreferenced / withdraw-referenced, raw blob per ADR-021 — and its
  implementation is tracked in [`material-content.md`](material-content.md).)

- **Idempotent duplicate protection on navigation-relationship acceptance.**
  Accepting a navigation relationship enforces self-reference, endpoint-kind, and
  prerequisite-cycle invariants (`src/storage.js`
  `assertNavigationRelationshipEndpoints` / `isValidNavigationRelationshipEndpointPair`
  / `assertNavigationRelationshipDoesNotCreateCycle`), but nothing prevents two
  accepted relationships with the same `(program_id, relationship_kind,
  from_entity_id, to_entity_id)` — `accepted_navigation_relationships` has no unique
  index on that tuple. A curator who accepts a duplicate (e.g. a second accepted
  `topic_includes_concept` for one topic/concept pair) ends up with redundant edges in
  accepted navigation. Add acceptance-time duplicate protection — either reject the
  second acceptance (`validation_failed`) or make it idempotent against the existing
  edge — plus the matching partial-unique index (scoped to `status = active` once
  ADR-022 lands, so a withdrawn-then-reaccepted edge is allowed). This is the
  *prevention* half; the *cleanup* half a curator needs to repair already-accepted
  duplicates (remove / retire / demote an accepted relationship) is the
  `active → withdrawn` path ADR-022 already decides for navigation relationships,
  tracked as the "Withdrawal/source-deletion spec + implementation" forward task in
  [`material-content.md`](material-content.md).

- **Drive the open-answer evaluator (nothing fires it).** The whole evaluation
  pipeline is implemented and wired — Nomos LLM provider adapter, evaluator
  policy/validation/redaction, the `runOpenAnswerEvaluatorWorkerOnce` worker, and
  the `POST /operations/open-answer-evaluator/tick` ops endpoint — but it is
  dormant: submitting an open answer records the attempt at `status:"submitted"`
  (`src/student-workspace.js` `submitOpenAnswerAttempt`) and never kicks
  evaluation, and the worker advances exactly one attempt per external tick. No
  scheduler, cron, or compose service calls the tick (deploy scripts don't; only
  `scripts/smoke-open-answer-evaluator.mjs` does manually), so a submitted attempt
  stays unevaluated indefinitely. Two gates, both empty by default: (1) provider
  is `enabled:false` unless `AGONARA_NOMOS_API_KEY`/`_BASE_URL`/`_MODEL` are set,
  and the tick needs `AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN` —
  `compose.prod.yml`/`compose.staging.yml` pass all four through but default each
  to empty; (2) no recurring driver of the tick exists. ADR-018 deliberately
  chose in-process single-flight driven by an external trigger, so the fix is a
  recurring driver (compose sidecar loop, host cron/systemd timer, or scheduled CI
  job POSTing with the trigger token) plus provisioned Nomos env — not new
  in-process machinery. Until both are in place the "verified later" the student
  flow implies never arrives.


## Design-reasoning companions

Not task lists, so exempt from the forward-tasks-only rule above: longer-form
design exploration that explains *why* a backlog's tasks exist. Kept beside the
backlog they inform.

- [`agenticops-affordances.md`](agenticops-affordances.md) — which AgenticOps
  platform ideas are worth adopting for Agonara; the reasoning behind the
  self-describing-API and platform-owns-process tasks in [`skills.md`](skills.md).

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
