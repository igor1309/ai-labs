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

Promote a topic to its own `backlog/<topic>.md` file when it is a distinct
concern that has reached roughly three or more items or is clearly going to grow;
keep small or uncategorized items in this index until then.

## Uncategorized items

Single items not yet promoted to a topic file.

- **Program lifecycle: archival / deletion / ownership transfer.** Still not
  exposed (`docs/specs/corpus-storage-and-curator-acceptance-api.md` #65/#66;
  `corpus-storage-and-curator-acceptance-first-slice.md` #37/#44); needs its own
  ADR for audit-preserving semantics.

- **Navigation-relationship acceptance uniqueness — implementation** of
  `docs/adr/adr-023-navigation-relationship-acceptance-uniqueness.md`. Spec
  (`docs/specs/navigation-relationship-acceptance-uniqueness.md`) and implementation plan
  (`docs/plans/navigation-relationship-acceptance-uniqueness.md`) are drafted; only the build
  remains. The work: application guards that prevent new active duplicates index-independently — the duplicate
  guard in `createAcceptedNavigationRelationshipRecord` surfaced as
  `navigation_relationship_already_accepted` (new `ApiRejectionReason` in `src/http-contract.js`),
  the reactivation precondition narrowing ADR-022 spec rule 10, and restore rejection of
  duplicate-bearing backups — plus a guarded backstop partial-unique index on
  `accepted_navigation_relationships (program_id, relationship_kind, from_entity_id, to_entity_id)
  WHERE status = 'active'` created by a startup step that skips-with-diagnostic (never auto-withdraws
  or deletes) until a curator has cleaned pre-existing duplicates via the ADR-022 API. **Sequenced
  after** the "Withdrawal/source-deletion spec + implementation" task in
  [`material-content.md`](material-content.md) (needs ADR-022's `status` column and withdraw/
  reactivate command in place first). This is the *prevention* half; *cleanup* of already-accepted
  duplicates is that ADR-022 withdrawal path.

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
