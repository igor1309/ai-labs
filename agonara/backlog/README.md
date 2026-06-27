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
  append-only design. The material-content pre-ADR
  (`docs/pre-adr/material-content-access_pre_adr.md`) now proposes a two-tier
  resolution for the source half of this: the **source raw content blob** is a
  free hard delete (non-load-bearing once accepted content is a self-contained
  copy), while the **source record** (metadata + `source_ids_json` edges) follows
  withdrawal/tombstone — settle the two together.

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

- **Make material content readable in-product (curator: full; student: read).**
  Confirmed real gap, not a transient mount issue. A `material_reference`'s
  `locator` is a free-form string Agonara stores verbatim and never resolves or
  serves (`src/corpus.js` `recordProgramSource`; `summarizeProgramSource` exposes
  only metadata + locator/citation), and in practice curator agents write their
  own **ephemeral** cache path into it — observed in a live curator session:
  `/root/.hermes/cache/documents/doc_…_tema_5_…psihologa.md`. Agonara stores no
  content: a `material_reference`'s `body` is an annotation-length **concise**
  body by spec (observed value was a one-sentence summary), not the source text,
  and the student surface returns only that card + relationships
  (`summarizeStudentNavigationRevision`; `/programs/{programId}/navigation`,
  `/navigation/entities/{entityId}`, `/navigation/revisions/{revisionId}`). So
  once the agent container recycles, the only copy of the extracted markdown is
  gone and **neither curator nor student** can read the text; re-uploading fixes
  one document until the next recycle. Owner-stated required direction: a curator
  has full read access to everything they provided or derived, and a student has
  read access. This **extends ADR-010** into space it explicitly deferred
  (Non-Goals: "material file storage, copying, scraping" and "content licensing
  policy") rather than overturning it — ADR-010's ownership/acceptance invariants
  still hold — and **revises navigation spec #28** ("a material reference is an
  accepted locator, citation, or concise body … navigation does not fetch, copy,
  upload, transform, or summarize external material content"). It also shifts
  **Product Intent**: today's stories frame materials as links to external sources
  the learner studies from (STU-09, CUR-01/07), not text the program hosts. Owner
  chose option (a): **Agonara stores the extracted content and serves it via
  role-gated reads.** Two owner-fixed (non-negotiable) boundaries: (1) content
  licensing/copyright is the **curator's** responsibility, not Agonara's — Agonara
  stores/serves what the curator loads and does not adjudicate or assume liability;
  (2) access model — curator has **read/write/delete** over everything loaded
  (sources, candidates, accepted content), student has **read** over accepted
  content only, and curator delete of evidenced accepted content resolves to
  withdrawal (soft delete) not erasure, per the
  `accepted-entity-withdrawal_pre_adr.md` mechanism. Pre-ADR at
  `docs/pre-adr/material-content-access_pre_adr.md` (arch-doc-review clean).
  Owner-approved sub-decisions folded in: sibling content table in the same
  SQLite DB (1:1 by `revision_id`, and by `source_id` for raw source content),
  capture at source intake + promote at acceptance (two content homes — source
  raw = curator-full, accepted = student-read), content rides the accepted-
  revision model (immutable per revision), hybrid read surface (lean navigation
  with a `hasContent` signal + a dedicated role-gated content route, so spec #28
  keeps its no-content-in-traversal rule), additive Product Intent (reference and
  content-bearing materials coexist), markdown/text only with a `content_format`
  and soft size cap. Remaining five questions now closed too: accepted content is
  a **self-contained copy** (with a provenance pointer), not a live reference;
  **two-tier source deletion** (free hard-delete of the raw blob, withdrawal for
  the source record — joint with the source-deletion item above); **~1 MB** soft
  cap with `content_too_large` and the existing `limit`/`cursor` pagination;
  **additive** intent (new curator/student stories + STU-09/CUR-03 "linked or
  hosted" amendment); `content_format` as a DB `check` seeded `markdown` +
  `plain_text`. Promoted to **ADR-021** (accepted) and specified in
  **`docs/specs/material-content-storage.md`** (draft). Next: implementation
  plan + implement the spec (storage tables + `content_format` `check` migration,
  content-capture writes, role-gated content read routes, `hasContent` navigation
  signal, backup/restore, the navigation spec #28 amendment, and the Product
  Intent story changes). The source-record-deletion half stays with the
  source-deletion item above; evidenced accepted-content withdrawal stays with the
  accepted-entity withdrawal pre-ADR.

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
