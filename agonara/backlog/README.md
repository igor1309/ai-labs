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

- **Authorized deletion of corpus sources (and program lifecycle).** Source
  records are append-only: no role has a delete via the API, and Program
  archival/deletion/ownership transfer are explicitly not exposed
  (`docs/specs/corpus-storage-and-curator-acceptance-api.md` #65/#66;
  `corpus-storage-and-curator-acceptance-first-slice.md` #37/#44). Decide, via an
  ADR, whether to add a **curator-authorized** source-removal (and/or program
  archival) operation with audit-preserving semantics. Until then, stray or test
  sources can only be removed by host-level DB surgery, which overrides the
  append-only design.

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

- **Decide whether students can read full material content (not just a
  reference).** Today the learner-facing surface is the accepted navigation
  graph: a `material_reference` carries `title`, `materialReferenceKind`, a
  `locator`/`citation`, and an optional **concise** `body`, plus its topic/concept
  relationships (`src/corpus.js` `summarizeStudentNavigationRevision`; student
  reads at `/programs/{programId}/navigation`, `/navigation/entities/{entityId}`,
  `/navigation/revisions/{revisionId}`). This is a deliberate boundary, not a
  curation gap: `docs/specs/topic-concept-material-navigation.md` #28 states
  navigation "does not fetch, scrape, copy, upload, transform, or summarize
  external material content. A material reference is an accepted locator,
  citation, or concise body stored in Corpus Storage," and raw Program sources
  are curator-only with no stored full text (`listProgramSources` is
  curator-gated; `summarizeProgramSource` exposes only metadata + locator/
  citation). So a student (or their agent) sees a material's card and links but
  has no API to open the original document as readable text. Decide, via an ADR,
  whether to add a student-facing "read full material" capability — and if so,
  whether the program even holds the content (it currently does not) or only ever
  resolves the `locator`/`citation` to an external source — versus affirming the
  reference-only boundary as intended and documenting it as the answer for
  learners who expect to read the source in-product.

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
