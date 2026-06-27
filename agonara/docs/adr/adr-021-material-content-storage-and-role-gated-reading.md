---
date: 2026-06-27
model: claude-opus-4-8
status: accepted
description: "Decision for storing program material content in Agonara and serving it through role-gated reads, with curator-owned licensing responsibility."
---

# ADR-021 — Material Content Storage and Role-Gated Reading

## Executive summary

Agonara MUST be able to store the **text content** of a program material and serve it
through **role-gated reads**, instead of holding only a `locator`/`citation`/concise
`body` that points at an external or agent-local file. A `Program Curator` has
read/write/delete over everything they load into their Program; a `Student` has read over
accepted content. **Content licensing/copyright is the curator's responsibility, not
Agonara's.** Content lives in two homes on the existing source → candidate → accepted
provenance chain: source raw content (curator-only) and accepted-revision content (a
self-contained, student-served copy). This decides the boundary, ownership, access, and
content-integrity invariants only; it extends [ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md)
into space its Non-Goals deferred and preserves ADR-010's invariants. Concrete schema,
routes, request/response shapes, Product Intent story text, and the navigation spec
amendment are left to a downstream spec.

## Context

A live curator session could not read the text of an accepted material: the accepted
record was intact (`acceptedKind: material_reference`, title, `locator`, `citation`,
`status: accepted`) but the `locator` was `/root/.hermes/cache/documents/…md` — a path
inside the curator agent's own ephemeral container. Agonara stores `locator` as a
free-form string it never resolves or serves (`src/corpus.js` `recordProgramSource`;
`summarizeProgramSource` exposes only metadata + `locator`/`citation`), and a material's
`body` is an annotation-length concise body by [navigation spec #28](../specs/topic-concept-material-navigation.md).
The extracted text only ever lived in the agent's throwaway cache; when the container
recycled, the only copy was gone, and neither curator nor student could read it. This is
structural, not a transient mount failure.

[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) owns the
accepted-corpus / curator-draft boundary and explicitly **defers** "material file storage,
copying, scraping" and "content licensing policy" to a later ADR (Non-Goals). So in-product
material content is unowned deferred space; this ADR fills it in while preserving ADR-010's
ownership, acceptance, provenance, revision-stability, and student-read-only invariants.
[ADR-002](adr-002-role-authority-scope-model.md) defines the `Program Curator`/`Student`
roles and [ADR-007](adr-007-effective-participation-authorization-contract.md) the
effective-participation authorization used to gate reads and writes.

The decision shifts Product Intent additively: today's stories frame materials as pointers
to external sources the learner studies from (`STU-09`, `STU-10`, `CUR-01`, `CUR-03`,
`CUR-07`); this ADR makes a material able to *also* carry hosted, accepted content, without
removing the reference model. The reasoning trail, options, and owner-approved
sub-decisions are recorded in the
[material-content pre-ADR](../pre-adr/material-content-access_pre_adr.md).

Rejected alternatives:

- **Durable-locator resolution** (Agonara stays metadata-first but resolves a durable
  external store): keeps content outside Agonara's ownership and adds a resolution layer;
  retained only as a fallback if storage/backup cost later forces content out of the DB.
- **BYOA-ingestion-contract-only** (keep Agonara metadata-only, require durable
  agent-independent locators): does not give an Agonara-guaranteed read; relocates the
  failure to the BYOA boundary rather than closing it.
- **Reference-into-source for accepted content** (no copy): a later source edit, withdrawal,
  or deletion would mutate or break what students read, violating the evidence-addressability
  invariant — the same dangling-pointer failure, internalized.
- **Mutable-in-place content** (no revision): silently rewrites what a student's evidence
  references; forbidden by ADR-010's revision-stability invariant.

## Decision

Agonara MUST support storing the text content of a program material in Corpus Storage and
serving it through role-gated reads. The decision has these parts:

1. **Two content homes** on the existing provenance chain:
   - **Source raw content**, captured at source intake, keyed by source, readable only by
     the Program's curator.
   - **Accepted material content**, promoted at acceptance, keyed by the accepted revision,
     readable by students and the curator.
2. **Accepted content is a self-contained copy.** Promotion copies the text onto the
   accepted revision; it MUST NOT be a live reference into source raw content. An optional
   provenance pointer to the source range it was derived from MAY be retained for
   traceability.
3. **Content rides the accepted-revision model.** Editing accepted content creates a new
   accepted revision; existing revisions keep their content unchanged.
4. **Access model.** A `Program Curator` has read/write/delete over everything loaded into
   their Program (source raw content, candidates, accepted content); delete is a hard delete
   for source raw content and for unevidenced accepted content, and resolves to withdrawal
   (soft delete) for accepted content referenced by student evidence — see Rules. A
   `Student` with effective participation has read over accepted content only.
5. **Licensing is the curator's responsibility.** By loading content, the curator warrants
   they hold the rights to store and share it within the Program. Agonara stores and serves
   what the curator loads and does not adjudicate, gate, or assume liability for licensing.
6. **Read surface.** Material content is served through a dedicated, role-gated content read
   surface, separate from navigation traversal. Navigation reads remain content-free and may
   expose a presence/size signal.
7. **Format and size.** Stored content is text (markdown or plain text) with a declared
   format and a soft per-material size ceiling; binary content is out of scope.

## Rules / invariants

- Corpus Storage MUST own stored material content. Stored content MUST live behind the
  ADR-010 acceptance boundary and MUST NOT be owned by Curator Workspace draft state or by
  Student Workspace.
- Source raw content MUST be readable only through effective `Program Curator` participation
  for the Program. It MUST NOT be readable by `Student` participation.
- Accepted material content MUST be readable by effective `Student` participation and by
  `Program Curator` participation for the Program.
- A `Student` MUST NOT write or delete any content. Students MUST NOT mutate accepted
  material content (consistent with ADR-010).
- Accepted material content MUST be a self-contained copy stored against the accepted
  revision. It MUST NOT resolve through a live reference into source raw content at read
  time.
- Editing accepted material content MUST create a new accepted revision through the ADR-010
  acceptance path (explicit, attributable to the acting `Identity`, scoped to the `Program`,
  authorized by effective `Program Curator` participation, provenance-preserving). It MUST
  NOT overwrite the content of an existing accepted revision.
- Accepted material content for a revision referenced by student attempts, feedback, or
  progress evidence MUST remain addressable and unchanged (consistent with ADR-010 and
  [accepted-entity withdrawal pre-ADR](../pre-adr/accepted-entity-withdrawal_pre_adr.md)).
- A `Program Curator` MUST be able to **hard-delete source raw content**; deleting source
  raw content MUST NOT affect accepted material content or student-referenced revisions
  (the self-contained copy makes the source blob non-load-bearing for students).
- A `Program Curator` MUST NOT be able to hard-erase accepted material content for a revision
  that student evidence references; such removal MUST go through withdrawal (soft delete
  preserving the evidenced revision). Deletion of unevidenced accepted content is
  unconstrained by this rule.
- The **source record** (metadata and provenance edges such as `source_ids_json`) MUST NOT
  be hard-deleted while accepted corpus references it; its removal MUST follow
  withdrawal/tombstone to preserve the provenance graph. This is the same decision as the
  open "Authorized deletion of corpus sources" backlog item and MUST be specified with it.
- Agonara MUST NOT adjudicate, gate, or assume liability for content licensing; the curator
  warrants rights at load time.
- Stored material content MUST be text with a declared content format constrained to an
  enforced vocabulary (initially markdown and plain text). Binary content MUST NOT be stored
  under this ADR.
- Stored material content MUST be subject to a soft per-material size ceiling; content above
  the ceiling MUST be rejected rather than truncated.
- Material content MUST be served through a dedicated role-gated content read surface.
  Navigation traversal reads MUST remain content-free; they MAY carry a content-presence or
  size signal.
- The `locator` and `citation` fields MUST remain provenance metadata and MUST NOT be the
  load-bearing path for serving readable content.

## Consequences

- The failure that triggered this decision is closed: readable material text no longer
  depends on any agent's ephemeral cache or any external host resolving. A curator can read
  what they loaded, and a student can read accepted content, from Agonara itself.
- Corpus Storage becomes a content store. Stored text adds row/blob weight and increases the
  in-memory backup/restore payload (`exportIdentityBackup` serializes every row); the soft
  size ceiling and the text-only constraint bound this. The content tables are a seam that
  later allows moving content out of the DB to a blob store (the rejected durable-locator
  alternative) if scale demands, without changing the ownership or access invariants.
- The self-contained-copy rule makes source raw content the curator's disposable working
  copy and accepted-revision content the durable, immutable, student-served truth — which is
  what makes free curator deletion of source raw content safe.
- A material may now be a pure external reference or carry hosted content; both remain
  first-class. The external-source path is also the licensing escape hatch: a curator who
  cannot warrant rights provides a reference instead of loading content.
- Product Intent and navigation spec #28 require amendment in the downstream spec: new
  curator/student stories for hosted content, a light "linked or hosted" amendment to
  `STU-09`/`CUR-03`, and a note that content is served off a dedicated route rather than
  through navigation traversal.
- Conformance to the Rules above MUST be verified by the downstream material-content
  spec's acceptance criteria and tests (domain, HTTP, and backup/restore), which assert the
  ownership, access, copy/immutability, deletion-tier, and licensing invariants. This ADR
  is the boundary; the spec is its enforcement mechanism.

## Non-goals

This ADR does not decide:

- concrete database tables, columns, indexes, or the migration that adds content storage;
- the exact `content_format` vocabulary values beyond the initial markdown/plain-text set,
  or the enforcement mechanism (e.g., DB `check`);
- the soft size-ceiling constant or the content-route pagination contract;
- the agent-facing content-capture request shape that replaces writing a path into
  `locator`, or the content read route names and envelopes;
- the exact Product Intent story text or the navigation spec #28 amendment wording;
- binary/non-text material storage, rendering, or sanitization, and any external blob-store
  adoption;
- the program-lifecycle half of the "Authorized deletion of corpus sources" backlog item
  (archival/ownership transfer);
- collaborative editing, branching, or publication workflows for content.
