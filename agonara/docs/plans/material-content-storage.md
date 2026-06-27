---
date: 2026-06-27
model: claude-opus-4-8
description: "Implementation plan for material content storage and role-gated reading (ADR-021, spec material-content-storage)."
status: draft
type: implementation-plan
---

# Material Content Storage Implementation Plan

## Goal

Implement [Material Content Storage and Role-Gated Reading](../specs/material-content-storage.md)
under [ADR-021](../adr/adr-021-material-content-storage-and-role-gated-reading.md) so Agonara
stores material text and serves it role-gated: a `Program Curator` reads/writes/deletes
source raw content and reads accepted material content; a `Student` reads accepted material
content. Curator hard-delete of the source raw blob is in scope; withdrawal of evidenced
accepted content and source-record deletion are out of scope (ADR-022, separate spec).

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout

## Execution lock

Worktree mode: none
Expected worktree: not applicable (`Worktree mode: none`; work in the primary checkout at `/home/user/ai-labs`)
Expected branch: `claude/agonara-material-content-impl-plan`
Preflight check: [x] done — branch `claude/agonara-material-content-impl-plan`, clean tree, deps installed, baseline Agonara suite + build green

## Scope guardrails

- Implement only the material-content spec. Do **not** implement ADR-022 withdrawal,
  source-record deletion, or `active → withdrawn` status — those need their own spec and plan.
- Do not change existing `/corpus-candidates`, `/accepted-corpus`, navigation, Quick Check,
  open-answer, readiness, Program Membership, Identity, Operations, or Admin contracts except
  where tests prove existing behavior is preserved. The only navigation change is the
  additive `hasContent`/`contentBytes`/`contentFormat` signal on material projections, with
  tests proving existing traversal behavior is preserved.
- Accepted material content MUST be a self-contained copy on the accepted revision, never a
  live reference into source raw content; editing accepted content goes through a new accepted
  revision and never overwrites an existing one.
- Material content reads are limited to effective Student or Program Curator participation;
  do not add Admin participation to content reads. Source raw content is curator-only.
- Do not gate, validate, or record content on licensing grounds (curator's responsibility).
- Do not load content into navigation traversal responses; navigation carries only a
  `hasContent` signal.
- Store text only (`markdown`/`plain_text`) under the soft size ceiling; do not add binary
  storage, a blob store, rendering, or sanitization.
- Do not start implementation until this plan passes adversarial review and is committed.
- Do not commit any phase until targeted tests, full Agonara tests, root build,
  `git diff --check`, and post-implementation self/adversarial review are clean.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` — `source_contents` (keyed by `source_id`) and
  `accepted_material_contents` (keyed by `revision_id`) tables with a `content_format`
  `check`, `byte_size`, optional `source_content_provenance_json`; backup export and restore
  graph validation.
- `agonara/src/corpus.js` — content capture at source intake and acceptance-time promotion
  (self-contained copy), source raw-content set/read/hard-delete, role-gated content read
  queries with `limit`/`cursor` paging, size/format validation, and `hasContent`/`contentBytes`/
  `contentFormat` on material navigation projections.
- `agonara/src/http-contract.js` — content route declarations, params, and the
  `content_too_large` / `content_not_found` rejection reasons.
- `agonara/src/server.js` — content route parsing, body validation, session/CSRF enforcement,
  pagination, redacted response mapping.
- `agonara/src/openapi-generator.js` — regenerate the OpenAPI surface for the new routes.
- `agonara/src/learn-ui.js` — `/learn` curator source-content load/read/delete and student
  material-content reading screens.
- `agonara/tests/storage.test.js` — content table storage and restore-validation tests.
- `agonara/tests/corpus.test.js`, `agonara/tests/corpus-executable-acceptance.test.js` —
  domain capture/copy/immutability, size/format, deletion, role-gating, and pagination tests.
- `agonara/tests/http-api.test.js`, `agonara/tests/executable-acceptance.test.js` — content
  route contracts, auth/CSRF gates, pagination, redaction, and `hasContent` projection tests.
- `agonara/tests/backup-restore.test.js` — content round-trip and malformed/oversized
  rejection tests.
- `agonara/tests/material-content-storage.playwright.js` — browser curator-load and
  student-read workflows.
- `agonara/playwright.config.js` — reuse existing config unless a strictly additive project
  setting is required.
- `agonara/docs/specs/material-content-storage.md` — update status/implementation status at
  closeout.
- `agonara/docs/specs/topic-concept-material-navigation.md` — apply the spec #28 amendment.
- `agonara/docs/intent/curator_user_stories.md`, `agonara/docs/intent/student_user_stories.md` —
  add the hosted-content stories and the STU-09/CUR-03 "linked or hosted" amendment.
- `agonara/docs/intent/intent_learning_program_app.md` — add code/test traceability at closeout.
- `agonara/README.md` — move material content from deferred to implemented snapshot.
- `agonara/backlog/material-content.md` — narrow the implemented forward tasks at closeout.
- `agonara/docs/log.md` — record each completed phase outcome.
- `agonara/docs/plans/implemented/material-content-storage.md` — archived plan after completion.
- `docs/loc-dashboard.html` — refresh at final closeout.

HTTP routes:

- `PUT /sources/{sourceId}/content`
- `GET /sources/{sourceId}/content?limit={limit}&cursor={cursor}`
- `DELETE /sources/{sourceId}/content`
- `GET /materials/{entityId}/content?limit={limit}&cursor={cursor}`
- `GET /materials/revisions/{revisionId}/content?limit={limit}&cursor={cursor}`
- `POST /programs/{programId}/sources` (extended with optional `content`/`contentFormat`)
- `POST /navigation-candidates/{candidateId}/acceptance` (extended with optional `content`/`contentFormat`/`sourceContentProvenance`)

Required UI screens and stable element ids:

- Curator content panel: `#material-content-curator-panel`, `#source-content-form`,
  `#source-content-id-input`, `#source-content-input`, `#source-content-format-input`,
  `data-action="save-source-content"`, `data-action="delete-source-content"`,
  `#source-content-status`.
- Student/curator content view: `#material-content-view`,
  `data-action="open-material-content"`, `data-action="load-more-material-content"`,
  `#material-content-body`, `#material-content-status`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "content storage" node --test --test-name-pattern "content|Content" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "content domain" node --test --test-name-pattern "content|Content" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "content http" node --test --test-name-pattern "content|Content" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "content backup restore" node --test --test-name-pattern "content|Content" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "content browser" npx playwright test agonara/tests/material-content-storage.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [x] Phase 1 — Content Storage Substrate and Restore Validation
- [x] Phase 2 — Corpus Domain Content Capture, Reads, and Deletion
- [x] Phase 3 — HTTP Content API and Navigation Signal
- [x] Phase 4 — Product UI Content Load and Read
- [ ] Phase 5 — Docs, Product Intent, Traceability, Dashboard, Archive

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-021: stored content owned by Corpus Storage, behind the acceptance boundary. | Phase 1, Phase 2, Phase 3 |
| ADR-021: accepted content is a self-contained copy, immutable per revision; edits create a new revision. | Phase 1, Phase 2 |
| ADR-021: evidenced revisions' content stays addressable and byte-identical. | Phase 1, Phase 2 |
| ADR-021: source raw content readable only by curator; accepted content readable by student + curator; students never mutate. | Phase 2, Phase 3 |
| ADR-021: Agonara does not gate or record licensing. | Phase 2 |
| ADR-021: dedicated content read surface; navigation content-free with a `hasContent` signal. | Phase 3, Phase 4 |
| ADR-021: text-only content with `content_format` vocabulary and a soft size ceiling. | Phase 1, Phase 2 |
| ADR-021: a curator hard-deletes source raw content; deletion does not affect accepted content or evidence. | Phase 2, Phase 3 |
| ADR-010: acceptance remains the explicit, attributable, provenance-preserving boundary. | Phase 2, Phase 3 |
| Spec #28 amendment: content served off a dedicated route, not navigation traversal. | Phase 3, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| New CUR story — load/derive readable material content (curator warrants rights) | Phase 2, Phase 3, Phase 4, Phase 5 |
| New STU story — read full accepted material content in-product | Phase 3, Phase 4, Phase 5 |
| STU-09 / CUR-03 — "linked or hosted" amendment | Phase 5 |
| STU-10 — back-links from material to concepts preserved | Phase 4 |

## Phase 1 — Content Storage Substrate and Restore Validation

**Objective**: persist source raw content and accepted material content, with format/size
constraints and restore-time validation.

**Key work items**:

- Add RED storage tests for `source_contents` (keyed by `source_id`, set/overwrite/read/delete)
  and `accepted_material_contents` (keyed by `revision_id`, byte-identical across replacement).
- Add RED storage tests rejecting a `content_format` outside `{markdown, plain_text}` via the
  `check` constraint and a `byte_size` over `MAX_MATERIAL_CONTENT_BYTES`.
- Add RED backup/restore tests for content round-trip with formats, byte sizes, and provenance
  pointers.
- Add RED backup/restore tests rejecting, before mutation, a source-content row referencing a
  missing source, an accepted-content row referencing a missing/non-`material_reference`
  revision, an invalid `content_format`, a `byte_size` mismatch, and an oversized `byte_size`.
- Implement the two content tables, the size constant, and restore validation in
  `agonara/src/storage.js`.

**Dependencies**: this plan is committed and reviewed clean.

**Risks**: restore validation accepts malformed/oversized content and corrupts recovery;
replacement writes mutate a prior revision's content.

**Validation**: targeted storage command; targeted backup/restore command; full Agonara tests;
root build; `git diff --check`; post-implementation self + adversarial review against the
storage and restore invariants; fix every fail or warning and rerun affected gates.

**Completion signal**: content storage persists both homes, keeps accepted content immutable
per revision, and rejects malformed/oversized content graphs before mutation.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 2 — Corpus Domain Content Capture, Reads, and Deletion

**Objective**: implement domain capture (source intake + acceptance promotion as a
self-contained copy), source raw-content hard delete, and role-gated paginated content reads.

**Key work items**:

- Add RED domain tests for content capture at source intake and acceptance-time promotion
  storing a self-contained copy with an optional provenance pointer.
- Add RED domain tests proving a later edit/delete of source raw content leaves accepted
  content unchanged, and that editing accepted content creates a new revision.
- Add RED domain tests for `content_too_large`, blank-content `validation_failed`, and the
  `content_format` vocabulary.
- Add RED domain tests for role-gating: curator-only source raw content read; student +
  curator accepted-content read; `content_not_found` for absent content.
- Add RED domain tests for `limit`/`cursor` pagination (full content, chunk + `nextCursor`,
  full `byteSize`, unresolvable-cursor/non-positive-`limit` rejection).
- Add RED boundary tests proving content reads create or mutate no Student Workspace state.
- Implement capture, copy, deletion, read queries, and the `hasContent` navigation projection
  fields in `agonara/src/corpus.js`; update executable domain acceptance coverage.

**Dependencies**: Phase 1 complete.

**Risks**: accepted content stored as a live reference; size/format validation bypassed; a
student-readable query leaking source raw content; pagination off-by-one.

**Validation**: targeted domain command; targeted storage command if helpers change; full
Agonara tests; root build; `git diff --check`; post-implementation self + adversarial review
against copy/immutability, role-gating, licensing-not-gated, and no-Student-state rules; fix
every fail or warning and rerun affected gates.

**Completion signal**: domain commands capture and copy content, hard-delete the raw blob
safely, and serve role-gated paginated reads without Student Workspace mutation.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 3 — HTTP Content API and Navigation Signal

**Objective**: expose the content routes with session/CSRF, pagination, redaction, the new
rejection reasons, and the `hasContent` signal on material navigation reads.

**Key work items**:

- Declare the content routes and the `content_too_large`/`content_not_found` reasons in
  `agonara/src/http-contract.js`; regenerate OpenAPI.
- Add RED HTTP tests: `PUT`/`DELETE /sources/{sourceId}/content` require Program Curator
  participation + CSRF; `PUT` returns a `SourceContentSummary` with no content bytes;
  `GET /sources/{sourceId}/content` rejects Student with `participation_required`.
- Add RED HTTP tests: `GET /materials/{entityId}/content` and `.../revisions/{revisionId}/content`
  readable by Student and Curator only, `content_not_found` when absent.
- Add RED HTTP tests: pagination behavior; content projections expose only `content`,
  `contentFormat`, `byteSize`, `nextCursor` and leak no provenance/secrets.
- Add RED HTTP tests: material navigation projections carry `hasContent`/`contentBytes`/
  `contentFormat` while traversal omits content bytes.
- Implement route parsing, validation, gates, pagination, and redacted mapping in
  `agonara/src/server.js`; extend source intake and acceptance bodies; update executable HTTP
  acceptance.

**Dependencies**: Phase 2 complete.

**Risks**: content bytes leaking into navigation traversal; missing CSRF/session gate;
redaction gaps; OpenAPI drift from `http-contract.js`.

**Validation**: targeted HTTP command; full Agonara tests; root build; `git diff --check`;
post-implementation self + adversarial review against auth/CSRF, redaction, pagination, and
the spec #28 boundary; fix every fail or warning and rerun affected gates.

**Completion signal**: content routes enforce the spec and navigation reads carry only the
content signal.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 4 — Product UI Content Load and Read

**Objective**: extend `/learn` so a curator loads/reads/deletes source content and a student
reads accepted material content with back-links preserved.

**Key work items**:

- Add RED browser tests: a curator saves source content and reads it back; layout and
  accessibility checks (named controls, no clipped text) at desktop and mobile widths.
- Add RED browser tests: a student opens an accepted material, reads its hosted content, and
  retains back-links to topics and concepts.
- Add RED browser test verifying student content screens render no curator-only provenance or
  operational metadata.
- Implement the curator content panel and student content view in `agonara/src/learn-ui.js`
  using the declared element ids.

**Dependencies**: Phase 3 complete.

**Risks**: student UI rendering source raw content or provenance; broken back-link navigation;
unnamed controls or clipped text.

**Validation**: `npx playwright --version`; targeted browser command; full Agonara tests; root
build; `git diff --check`; post-implementation self + adversarial review against redaction and
accessibility; fix every fail or warning and rerun affected gates.

**Completion signal**: curators load/read/delete content and students read accepted content
in-product with preserved structure links.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 5 — Docs, Product Intent, Traceability, Dashboard, Archive

**Objective**: land the required doc changes and close out traceability.

**Key work items**:

- Apply the spec #28 amendment in `topic-concept-material-navigation.md` (content served off a
  dedicated route; navigation stays content-free with a `hasContent` signal).
- Add the new curator and student hosted-content stories and the STU-09/CUR-03 "linked or
  hosted" amendment in the intent files; keep CUR-01/07 unchanged.
- Update `material-content-storage.md` to `status: implemented` with implementation/verification
  links; add code/test traceability in `intent_learning_program_app.md`.
- Update `README.md` snapshot, narrow `backlog/material-content.md`, refresh
  `docs/loc-dashboard.html`, and record outcomes in `docs/log.md`.
- Move this plan to `docs/plans/implemented/material-content-storage.md`.

**Dependencies**: Phases 1–4 complete and verified.

**Risks**: stale spec status or intent traceability; backlog not narrowed; dashboard not
refreshed.

**Validation**: full Agonara tests; root build; docs link/front-matter/single-H1 checks;
`git diff --check`; final self + adversarial review of the doc set.

**Completion signal**: docs, intent, traceability, dashboard, and archive reflect the
implemented material-content capability.

**Commit**: commit the closeout with a short imperative message.

## Done criteria

- Source raw content and accepted material content are stored as text with an enforced
  `content_format` and a soft byte ceiling; accepted content is a self-contained, immutable
  copy.
- Curators set/read/hard-delete source raw content; students and curators read accepted
  content through dedicated, paginated, role-gated routes; navigation stays content-free with
  a `hasContent` signal.
- Backup/restore preserve both content tables and reject malformed/oversized content before
  mutation.
- Product Intent carries the hosted-content stories and the "linked or hosted" amendment; spec
  #28 is amended.
- Agonara tests, root build, docs checks, and `git diff --check` pass; the plan is archived.

## Final closeout

Final gates: all phase tracker boxes checked with their phase commits; spec marked
implemented; intent traceability updated; backlog narrowed; dashboard refreshed;
full Agonara tests, root build, docs link/front-matter/single-H1 checks, and
`git diff --check` pass; final self + adversarial review of the doc set is clean.
Archive plan: move to `agonara/docs/plans/implemented/material-content-storage.md`.
Commit archive move: yes.
Push/PR: follow push policy; open a single PR for the task.
