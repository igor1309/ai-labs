---
title: Agonara In-Product Material Content Storage and Role-Gated Reading Pre-ADR
date: 2026-06-27
description: Pre-ADR pressure-testing whether Agonara should store the extracted text of a program material and serve it through role-gated reads, so a curator has full access to everything they provided or derived and a student has read access — instead of holding only a locator/citation/concise body that points at an external or agent-local file.
model: claude-opus-4-8
version: 0.1.0
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
- **Navigation spec #28** is the concrete constraint that a content-bearing path
  revises: "navigation does not fetch, scrape, copy, upload, transform, or summarize
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
program can hold and serve the material itself." That shift carries a content
licensing/copyright surface ADR-010 deliberately deferred. The owner has stated the
required direction regardless: a curator must have full read access to everything they
provided or derived, and a student must have read access.

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
  revisioned content, backup/restore weight), and Agonara takes on a content
  licensing/copyright surface it has so far deferred.
- **Product intent fit**: satisfies the owner's stated curator-full / student-read
  requirement directly. Requires amending Product Intent from "materials are external
  sources" to "materials may carry hosted, accepted content," and revising navigation
  spec #28. Preserves ADR-010 (content lives in Corpus Storage, behind the acceptance
  boundary, with provenance, read-only for students).
- **Risks**: content licensing/ownership for third-party source text; storage growth and
  backup/restore cost; defining the acceptance-time content-capture contract so the BYOA
  agent uploads text rather than a path; deciding revision semantics for content edits.

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
- **Product intent fit**: same curator-full / student-read outcome as A; preserves more
  of the "material is a reference" framing while still guaranteeing an Agonara-served
  read. Still revises navigation spec #28 and needs the same licensing decision.
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
provenance, and student-read-only invariants. Option B is the fallback if storage cost or
licensing pushes Agonara away from inlining content; Option C is recorded for
completeness but does not meet the requirement (no Agonara-guaranteed read).

This is provisional and not a commitment. The ADR must still resolve the open questions
below — most importantly content licensing, which ADR-010 deferred on purpose.

## Provisional boundaries

- **Corpus Storage** owns accepted material content (text), addressable by stable
  entity/revision ids, behind the ADR-010 acceptance boundary. *(extends ADR-010 deferred
  material-storage space; preserves its ownership invariant)*
- **Acceptance** remains the only path that promotes content into accepted corpus —
  explicit, attributable to the acting `Identity`, scoped to the `Program`, authorized by
  effective `Program Curator` participation, provenance-preserving. *(unchanged from
  ADR-010)*
- **Read authorization**: `Program Curator` reads full content for their Program's
  materials (provided and derived); `Student` with effective participation reads accepted
  material content; students never mutate it. *(role split per ADR-002 / ADR-007)*
- **`locator` / `citation`** remain provenance metadata, no longer the load-bearing read
  path. *(stable)*
- **Content capture contract** (BYOA agent uploads extracted text at intake/acceptance
  rather than a path): owned by a later spec. *(unstable)*
- **Navigation spec #28** is superseded for the content-bearing read path; whether
  content is served through the navigation read endpoints or a separate material-content
  read surface: deferred. *(unstable)*
- **Content licensing/copyright policy**: deferred to the ADR / a dedicated decision —
  ADR-010 deferred it and it is now load-bearing. *(unresolved)*

## Open questions

- **Licensing/copyright**: under what terms may Agonara host third-party source text, and
  does that gate which `materialReferenceKind`s may carry stored content versus reference
  only?
- **Inline content vs. durable reference (A vs. B)**: does Agonara store the bytes itself,
  or store a content-addressed reference to a durable store it operates? What is the
  storage/backup-restore budget that decides this?
- **Content capture point**: is content captured at source intake, at candidate
  extraction, or only at acceptance — and what is the agent-facing contract that replaces
  "write a local path into `locator`"?
- **Content revisions**: do content edits create new accepted revisions (like other
  corpus), and must historical content remain addressable when student evidence
  references the material at a past revision?
- **Read surface**: is stored content delivered through the existing navigation read
  endpoints (revising spec #28) or through a distinct material-content read route with
  its own projection and size/pagination handling?
- **Product Intent amendment**: which student/curator stories change to encode "materials
  may carry hosted, accepted content," and does the "external source" framing survive
  alongside it?
- **Size and format**: any limits on stored content size/format, and how large materials
  are paginated for agent reads.
