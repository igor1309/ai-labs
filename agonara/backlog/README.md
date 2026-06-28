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

- **Module → topic navigation hierarchy (no topic-grouping layer exists).** A
  curator reported (program 1840) that a `relationship_update` with
  `relationshipKind: topic_includes_topic` to nest accepted numbered topics
  (Тема 1–9) under an accepted module-topic is `rejected` /`validation_failed`.
  This is **working as designed, not a bug**: navigation is deliberately two-level.
  `topic_includes_topic` is not in `supportedNavigationRelationshipKinds`
  (`src/corpus.js`), and `isValidNavigationRelationshipEndpointPair` (`src/storage.js`)
  has no topic→topic pair — the only topic-rooted edges are `topic_includes_concept`
  and `topic_uses_material` (navigation spec
  `docs/specs/topic-concept-material-navigation.md` rule 13). There is no `module`
  corpus kind either; a "module" today is just another top-level `topic` node. So
  accepted topic nodes cannot be placed under a module in navigation, and
  module-level student traversal exists only indirectly via `topic_uses_material`.
  The semantic/topic layer is complete; only the **structural** Module → Topic
  hierarchy is missing. This needs a **pre-ADR/ADR decision** (extends the ADR-010
  acceptance boundary and changes the navigation contract — not a config tweak)
  choosing among: (a) add a self-referential `topic_includes_topic` kind with
  acyclicity guards mirroring `concept_prerequisite`, plus student-read projection
  and "ungrouped topic" semantics; (b) introduce a distinct `module` corpus kind
  with a `module_includes_topic` kind; or (c) surface the existing period-readiness
  scopes (named sets of topics, `docs/specs/topic-period-readiness-checks.md`) as a
  navigation grouping rather than readiness-only metadata. Each ripples into
  `ProgramNavigationSummary` grouping, ungrouped-node rules (spec rule 22), backup/
  restore graph validation (rule 27), and the ADR-023 uniqueness tuple. Pick the
  direction before any build.

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
