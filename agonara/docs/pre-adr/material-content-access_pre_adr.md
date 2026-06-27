---
title: Agonara In-Product Material Content Storage and Role-Gated Reading Pre-ADR
date: 2026-06-27
description: Pre-ADR pressure-testing whether Agonara should store the extracted text of a program material and serve it through role-gated reads, so a curator has full access to everything they provided or derived and a student has read access — instead of holding only a locator/citation/concise body that points at an external or agent-local file.
model: claude-opus-4-8
version: 0.3.0
---

# Agonara In-Product Material Content Storage and Role-Gated Reading Pre-ADR

## Purpose

This document pressure-tests letting Agonara **store the text of a program material**
and serve it through **role-gated reads** — a curator reading the full content of every
material they provided or derived, and a student reading the content of accepted
materials — instead of the current model where a `material_reference` holds only a
`title`, `materialReferenceKind`, a free-form `locator`/`citation`, and a **concise**
`body`.

This document is not a data model, schema, API design, UI specification, or
implementation plan, and it is not an accepted ADR. It captures the gap, the options,
and a candidate direction for a future ADR. The direction extends
[ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md) into space it
explicitly deferred; it does not overturn ADR-010's ownership and acceptance invariants.

## Context

### The triggering gap

A live curator session could not read the text of an accepted material ("Тема 5. Моральные
дилеммы в деятельности практического психолога"). The accepted record was intact —
`acceptedKind: material_reference`, a title, a `locator`, a `citation`, `status: accepted` —
but the text was unreachable. Diagnosis:

- The `locator` was `/root/.hermes/cache/documents/doc_…_tema_5_…psihologa.md` — a path
  **inside the curator agent's own ephemeral container** (`.hermes` = the BYOA agent
  runtime), not an Agonara resource.
- Agonara stores `locator` as a free-form string. `recordProgramSource`
  (`src/corpus.js`) validates only that it is optional text; nothing resolves it, reads
  it, or serves it. `summarizeProgramSource` returns metadata + `locator`/`citation`
  only — there is **no content field on a source**.
- The material's `body` was a one-sentence annotation, not the source text. By
  [navigation spec #28](../specs/topic-concept-material-navigation.md) `body` is an
  **accepted locator, citation, or concise body** — annotation-length by design.

So the extracted markdown only ever lived in the agent's throwaway cache. When the
container recycled, the only copy was gone, and **neither curator nor student** could
read the text. Re-uploading fixes one document until the next recycle. This is
structural, not a transient mount failure.

### What the current architecture already settles

- **ADR-010** owns the accepted-corpus / curator-draft boundary: accepted material
  references and **source metadata** live in Corpus Storage; acceptance is an explicit,
  attributable, provenance-preserving `Program Curator` action; Student Workspace reads
  accepted corpus and never mutates it. ADR-010's **Non-Goals explicitly defer**
  "material file storage, copying, scraping, or citation format" and "content licensing
  policy" to a later ADR. So in-product material content is **unowned deferred space**,
  not a settled boundary — a content-storage ADR fills it in and must preserve ADR-010's
  invariants.
- **Navigation spec #28** is the concrete constraint a content-bearing path must
  address: "navigation does not fetch, scrape, copy, upload, transform, or summarize
  external material content. A material reference is an accepted locator, citation, or
  concise body stored in Corpus Storage."

### The Product Intent tension

Today's accepted stories frame materials as **pointers to external sources the learner
studies from**, not text the program hosts:

- `STU-09` "study from relevant sources"; `STU-10` "return from a material to the
  concepts it supports."
- `CUR-01` / `CUR-07` create a program from, and attach, **external sources** (public
  plans, exam requirements, standards, links, research findings); `CUR-03` links
  materials so "students know why each material is included."

Hosting material text in-product is therefore not only a spec change — it shifts the
product model from "a material is a reference to something you read elsewhere" to "the
program can hold and serve the material itself."

### Owner-fixed boundaries (non-negotiable)

Two boundaries are set by the owner. They are non-negotiable inputs to this decision, not
open questions, and the ADR MUST encode them verbatim in intent:

- **Content licensing/copyright MUST be the curator's responsibility, not Agonara's.** By
  loading content into a Program, the curator warrants they hold the rights to store and
  share it within that Program. Agonara MUST store and serve what the curator loads and
  MUST NOT adjudicate, gate, or assume liability for licensing. ADR-010 listed "content
  licensing policy" as a Non-Goal; this fixes the policy as *out of Agonara's
  responsibility* rather than leaving it open.
- **Access model.** A `Program Curator` MUST have read, write, and delete over everything
  loaded into their Program (sources, candidates, accepted content). A `Student` MUST have
  read over accepted content and MUST NOT write or delete. "Delete" of accepted content
  that student evidence already references resolves to withdrawal (soft delete preserving
  the evidenced revision), not hard erasure — see Provisional boundaries below; deletion
  of unevidenced or draft/source content is unconstrained by that invariant.

## Options considered

### Option A — Agonara stores the extracted content and serves it role-gated

- **Description**: at acceptance (or source intake), the extracted material text is
  stored in Corpus Storage as content owned by Agonara, addressable by stable
  entity/revision ids like other accepted corpus. Reads are role-gated: a `Program
  Curator` reads full content for materials in their Program; a `Student` with effective
  participation reads accepted material content. The `locator`/`citation` remain as
  provenance, but the readable text no longer depends on them resolving.
- **Tradeoffs**: the only option that makes content durable and role-gated **independent
  of any agent's cache or external host** — it directly removes the failure mode that
  triggered this note. Cost: Corpus Storage becomes a content store (larger rows/blobs,
  revisioned content, backup/restore weight). Licensing is not a cost Agonara carries —
  it is the curator's responsibility (owner-fixed boundary).
- **Product intent fit**: satisfies the curator-full-CRUD / student-read requirement
  directly. Requires amending Product Intent from "materials are external sources" to
  "materials may carry hosted, accepted content," and addressing navigation spec #28.
  Preserves ADR-010 (content lives in Corpus Storage, behind the acceptance boundary,
  with provenance, read-only for students).
- **Risks**: storage growth and backup/restore cost; defining the acceptance-time
  content-capture contract so the BYOA agent uploads text rather than a path; reconciling
  curator **delete** of accepted content with ADR-010's invariant that revisions
  referenced by student evidence stay addressable (ties to the
  [accepted-entity withdrawal pre-ADR](accepted-entity-withdrawal_pre_adr.md)); deciding
  revision semantics for content edits.

### Option B — Agonara resolves a durable locator and serves the bytes

- **Description**: Corpus Storage stays metadata-first, but a material's `locator` must
  reference a **durable store Agonara can read** (object store, content-addressed handle)
  rather than a free-form/agent-local path. Agonara resolves and serves the bytes on
  read, role-gated as in Option A.
- **Tradeoffs**: lighter corpus schema (no large content rows; a reference + a fetch);
  similar durability and the same role-gated read surface for both roles. Cost: Agonara
  now owns/operates a content store anyway (or a trusted integration to one), plus a
  resolution/validation layer; provenance and "what exactly was accepted" get fuzzier
  than inlined content if the durable blob can change under the reference.
- **Product intent fit**: same curator-full-CRUD / student-read outcome as A; preserves
  more of the "material is a reference" framing while still guaranteeing an Agonara-served
  read. Still must address navigation spec #28.
- **Risks**: content drift if the referenced blob is mutable; operational ownership of
  the durable store; validating that a locator is genuinely durable at acceptance time.

### Option C — Keep Agonara metadata-only; fix the BYOA ingestion contract

- **Description**: Corpus Storage stays metadata-only (no content, no resolution).
  Tighten the BYOA ingestion contract so a `locator` MUST point at a durable,
  agent-independent location both the curator's and student's agents can re-read
  themselves. Agonara never serves content.
- **Tradeoffs**: lightest for Agonara; preserves navigation spec #28 and the current
  Product Intent unchanged. Cost: "student read access" is **not an Agonara guarantee** —
  it depends on each agent's environment reaching the external location, and there is no
  in-product, role-gated read.
- **Product intent fit**: keeps the "external source" framing the current stories already
  encode. Does not satisfy the owner's requirement that Agonara itself give curator and
  student readable access — it relocates the problem to the BYOA boundary rather than
  closing it.
- **Risks**: fragmentation across heterogeneous agent environments; no single point that
  can enforce or audit read access; the same "file not found" failure recurs whenever an
  agent cannot reach the external location.

## Emerging direction

**Option A**, per the owner's stated direction. It is the only option that makes material
content durable and role-gated **inside Agonara**, independent of any agent cache or
external host — which is exactly the failure that triggered this note. It fits ADR-010 by
filling in deferred material-storage space while preserving its ownership, acceptance,
provenance, and student-read-only invariants. Option B is the fallback if storage or
backup/restore cost pushes Agonara away from inlining content; Option C is recorded for
completeness but does not meet the requirement (no Agonara-guaranteed read).

### Resolved sub-decisions (owner-approved)

Within Option A, the owner approved the following directions. They are recorded here as
the emerging shape the ADR should inherit; they remain provisional until the ADR commits.

- **Storage mechanism** — a **sibling content table in the same SQLite DB**, 1:1 by
  `revision_id` (and by `source_id` for raw source content), not inlined on the corpus
  revision row and not an external blob store. Keeps card/navigation reads lean; rides the
  existing single-file backup/restore; leaves a seam to move just the content table to a
  blob store later if non-text materials ever appear.
- **Capture point** — content is captured **at source intake** (raw) and **promoted at
  acceptance** (student-readable), giving two content homes (see table below). This is the
  pick that actually closes the root cause: text enters Agonara when the curator first
  loads the source, never living only in an agent's ephemeral cache.
- **Revisioning** — content **rides the existing accepted-revision model**: editing
  content creates a new accepted revision, historical revisions keep their content,
  content is immutable per revision. No in-place mutation, no independent content-version
  timeline.
- **Read surface** — **hybrid**: navigation reads stay lean but expose a cheap signal
  (`hasContent` / `contentBytes` / `contentFormat`); the bytes are fetched through a
  dedicated, role-gated, paginable material-content route. Navigation itself still carries
  no content (preserves spec #28's spirit).
- **Product Intent** — **additive**: a material may be a pure reference (today's model) or
  carry hosted content; both first-class. The external-source stories survive unchanged
  and remain the licensing escape hatch (no rights to host ⇒ provide a reference).
- **Size / format** — **markdown / plain-text only**, with a declared `content_format` and
  a soft per-material size cap; binaries are out of scope until a separate blob-store
  decision.
- **Source ↔ accepted de-duplication** — accepted-revision content is a **self-contained
  copy** (not a reference into the source), with an **optional provenance pointer** to the
  source range it was derived from. A self-contained copy is what keeps an evidenced
  revision addressable regardless of later source edits/withdrawal/deletion; the pointer
  preserves traceability and re-derivation.
- **Source raw-content deletion** — **two-tier**: the curator may **hard-delete the source
  raw content blob** at will (the copy decision makes it non-load-bearing for students and
  evidence), while the **source record** (metadata + `source_ids_json` provenance edges)
  follows withdrawal/tombstone. Settles jointly with the *"Authorized deletion of corpus
  sources"* backlog item.
- **Size cap & pagination** — soft cap **~1 MB per material content** (reject above with a
  `content_too_large` rejection), reusing the existing **`limit` + opaque `cursor`**
  pagination idiom on the content route; small materials return whole in one page.
- **Product Intent shape** — **add new stories** (curator loads/derives readable content;
  student reads accepted content in-product) **and lightly amend** STU-09 / CUR-03 to read
  "linked **or** hosted"; CUR-01 / CUR-07 (external sources) stay as-is.
- **`content_format` vocabulary** — a **DB `check` constraint** (mirroring
  `material_reference_kind`), seeded with `markdown` and `plain_text`; further formats are
  additive `check` migrations.

Content licensing is **not** an open question — it is the curator's responsibility by
owner-fixed boundary, not an Agonara decision.

## Provisional boundaries

- **Corpus Storage** owns accepted material content (text), addressable by stable
  entity/revision ids, behind the ADR-010 acceptance boundary. *(extends ADR-010 deferred
  material-storage space; preserves its ownership invariant)*
- **Acceptance** remains the only path that promotes content into accepted corpus —
  explicit, attributable to the acting `Identity`, scoped to the `Program`, authorized by
  effective `Program Curator` participation, provenance-preserving. *(unchanged from
  ADR-010)*
- **Access model (owner-fixed)**: per the owner-fixed boundary above — `Program Curator`
  read/write/delete over everything loaded; `Student` read over accepted content only,
  no write/delete; curator delete of evidenced accepted content is withdrawal, not
  erasure. *(role split per ADR-002 / ADR-007; CRUD per owner-fixed boundary)*
- **Content licensing (owner-fixed)**: the curator warrants rights to content they load;
  Agonara stores/serves it and does not adjudicate or assume licensing liability. ADR-010
  listed content licensing as a Non-Goal — this fixes it as *out of Agonara's
  responsibility*. *(stable)*
- **Two content homes** riding the existing source → candidate → accepted provenance
  chain:

  | Home | Keyed by | Captured | Access | Mutability |
  |---|---|---|---|---|
  | Source raw content | `source_id` | at source intake | curator (full) | per source |
  | Accepted material content | `revision_id` | promoted at acceptance | student (read) + curator | immutable per revision |

  Both stored as text in sibling tables in the same SQLite DB. Accepted content is a
  **self-contained copy** with an optional provenance pointer to the source range it came
  from — never a live reference into the source. *(emerging)*
- **`locator` / `citation`** remain provenance metadata, no longer the load-bearing read
  path. *(stable)*
- **Content capture contract**: the BYOA agent uploads extracted **text** at source intake
  (replacing "write a local path into `locator`"); exact agent-facing shape owned by a
  later spec. *(emerging)*
- **Read surface**: a dedicated role-gated material-content route (`…/content`) serves the
  bytes, paginated with the existing `limit` + opaque `cursor` idiom (whole content in one
  page when small); navigation reads stay content-free and carry a `hasContent` signal.
  Navigation spec #28 keeps its no-content rule for traversal; the content route is the
  sanctioned exception. *(emerging)*
- **Size / format**: soft cap ~1 MB per material content (`content_too_large` above it);
  `content_format` constrained by a DB `check` seeded with `markdown` + `plain_text`.
  *(emerging)*
- **Deletion model** *(resolved two-tier)*: **curator delete of source raw content** is a
  free hard delete — the self-contained-copy decision makes the raw blob non-load-bearing
  for students and evidence; the **source record** (metadata + `source_ids_json` edges)
  follows withdrawal/tombstone to keep provenance intact, settled jointly with the
  *"Authorized deletion of corpus sources"* backlog item. **Curator delete of accepted
  content** reconciles with ADR-010's "evidenced revisions stay addressable" invariant via
  the withdrawal mechanism in the
  [accepted-entity withdrawal pre-ADR](accepted-entity-withdrawal_pre_adr.md), not hard
  erasure of evidenced revisions. *(emerging)*

## Open questions

None blocking. The architectural decision space is closed: Option A with the
owner-approved sub-decisions and the owner-fixed boundaries above. **Promoted to
[ADR-021](../adr/adr-021-material-content-storage-and-role-gated-reading.md).**

What remains is **specification-level detail**, owned by the ADR's downstream spec(s), not
by this pre-ADR:

- exact table columns, the `content_format` `check` definition, and the migration that
  adds the content tables;
- the agent-facing content-capture request shape (replacing "write a local path into
  `locator`") and the content-route request/response envelopes;
- the precise `limit`/`cursor` chunking contract and the `content_too_large` threshold
  constant;
- the exact Product Intent story text (new curator/student stories + the STU-09 / CUR-03
  "linked or hosted" amendment) and the navigation spec #28 amendment note.
