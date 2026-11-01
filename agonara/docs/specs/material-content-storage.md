---
date: 2026-06-27
model: claude-opus-4-8
description: "Spec: Agonara material content storage and role-gated reading."
version: 0.0.2
status: implemented
type: spec
---

# Material Content Storage and Role-Gated Reading

## Goal

Define the contract, owned by Corpus Storage, for storing the text content of program
materials and serving it through role-gated reads — source raw content readable by the
Program's curator, accepted material content readable by students — so material text lives
in Agonara instead of an external or agent-local file. Governed by
[ADR-021](../adr/adr-021-material-content-storage-and-role-gated-reading.md).

## Implementation status

Implemented per [`docs/plans/implemented/material-content-storage.md`](../plans/implemented/material-content-storage.md),
pinning the spec-level detail [ADR-021](../adr/adr-021-material-content-storage-and-role-gated-reading.md)
deferred. Extends the corpus model of
[Topic, Concept, and Material Navigation](topic-concept-material-navigation.md) and amends its
Behavior rule #28.

Primary implementation and verification:

- [Storage and backup/restore](../../src/storage.js) (`source_contents`, `accepted_material_contents`,
  `MAX_MATERIAL_CONTENT_BYTES`, content-graph restore validation), with coverage in
  [storage tests](../../tests/storage.test.js) and [backup/restore tests](../../tests/backup-restore.test.js).
- [Corpus domain commands](../../src/corpus.js) (`setSourceContent`/`deleteSourceContent`/`readSourceContent`,
  `setAcceptedMaterialContent`, `readMaterialContent`/`readMaterialRevisionContent`, `hasContent`
  projection signal), with coverage in [Corpus tests](../../tests/corpus.test.js) and
  [executable acceptance](../../tests/corpus-executable-acceptance.test.js).
- [HTTP routes](../../src/server.js) and [contract](../../src/http-contract.js), with coverage in
  [http-api-material-content.test.js](../../tests/http-api-material-content.test.js) and [OpenAPI contract tests](../../tests/openapi-contract.test.js).
- [`/learn` reader and curator content UI](../../src/learn-ui.js), with browser coverage in
  [navigation Playwright tests](../../tests/topic-concept-material-navigation.playwright.js).

Accepted-content withdrawal and source-record deletion are implemented separately under
[ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md) and its
[implemented spec](accepted-entity-withdrawal-and-source-deletion.md); this material-content
spec covers raw-blob hard delete only.

## Public interface

### Shared kinds

```ts
type ContentFormat = "markdown" | "plain_text";

// Soft per-material ceiling, enforced on every write that stores content.
// 1 MiB = 1048576 bytes (UTF-8). Configurable via AGONARA_MAX_MATERIAL_CONTENT_BYTES.
const MAX_MATERIAL_CONTENT_BYTES = 1048576;
```

### Storage shapes

```ts
// Source raw content: one row per Program source, curator-only, hard-deletable.
type SourceContent = {
  sourceId: string;        // primary key, references program_sources(id)
  content: string;         // UTF-8 text
  contentFormat: ContentFormat;
  byteSize: number;        // UTF-8 byte length of content
  recordedByIdentityId: string;
  recordedAt: string;      // ISO-8601
};

// Accepted material content: one row per accepted material_reference revision,
// a self-contained copy, immutable for the life of that revision.
type AcceptedMaterialContent = {
  revisionId: string;      // primary key, references accepted_corpus_revisions(id)
  content: string;         // UTF-8 text (copy, not a live reference into a source)
  contentFormat: ContentFormat;
  byteSize: number;
  sourceContentProvenance?: {   // optional traceability pointer; NOT used for read resolution
    sourceId: string;
    range?: { start: number; end: number };  // character offsets into source content
  };
};
```

### Write shapes

```ts
// Source intake (extends recordProgramSource) and replace.
type SetSourceContentInput = {
  content: string;
  contentFormat: ContentFormat;
};

// Promotion: accepted material content is set on a material_reference revision by a
// dedicated curator command, not threaded into the acceptance call.
type SetAcceptedMaterialContentInput = {
  content: string;
  contentFormat: ContentFormat;
  sourceContentProvenance?: AcceptedMaterialContent["sourceContentProvenance"];
};
```

### Read shapes

```ts
type MaterialContentPage = {
  content: string;          // full content, or a chunk when paginated
  contentFormat: ContentFormat;
  byteSize: number;         // byte length of the FULL content, not the chunk
  nextCursor?: string;      // present only when more content remains
};

// Redacted confirmation returned by writes that set source content; carries no
// content bytes.
type SourceContentSummary = {
  sourceId: string;
  contentFormat: ContentFormat;
  byteSize: number;
  recordedByIdentityId: string;
  recordedAt: string;       // ISO-8601
};

// Added to existing student-safe and curator material projections.
type MaterialContentSignal = {
  hasContent: boolean;
  contentBytes?: number;    // present when hasContent
  contentFormat?: ContentFormat;
};
```

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `PUT` | `/sources/{sourceId}/content` | Program Curator session and CSRF header | `AcceptedResult<{ sourceContent: SourceContentSummary }>` |
| `GET` | `/sources/{sourceId}/content?limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<MaterialContentPage>` |
| `DELETE` | `/sources/{sourceId}/content` | Program Curator session and CSRF header | `AcceptedResult<{ sourceId: string }>` |
| `PUT` | `/materials/revisions/{revisionId}/content` | Program Curator session and CSRF header | `AcceptedResult<{ materialContent: { revisionId; contentFormat; byteSize } }>` |
| `GET` | `/materials/{entityId}/content?limit={limit}&cursor={cursor}` | Student or Program Curator session | `AcceptedResult<MaterialContentPage>` |
| `GET` | `/materials/revisions/{revisionId}/content?limit={limit}&cursor={cursor}` | Student or Program Curator session | `AcceptedResult<MaterialContentPage>` |

`PUT /materials/revisions/{revisionId}/content` (`SetAcceptedMaterialContentInput`) sets the
self-contained accepted content on an accepted `material_reference` revision; it is rejected
with `material_content_already_set` if that revision already has content. Source content may
also be supplied at intake via optional `content`/`contentFormat` on
`POST /programs/{programId}/sources` (`SetSourceContentInput`). `limit` is a positive
integer **character** count (omitted ⇒ whole content; capped at
`MAX_MATERIAL_CONTENT_BYTES`); `cursor` follows the existing opaque `Cursor` schema and
encodes the next character offset. (The shared list `Limit` schema, max 100, is not reused
here — it counts list items, not characters.)

## Behavior rules

1. Stored content is text only. `contentFormat` must be one of `markdown` or `plain_text`,
   enforced by a database `check` constraint on both content tables. Any other value is
   rejected with `validation_failed`.
2. Every write that stores or replaces content computes `byteSize` as the UTF-8 byte length
   of `content` and rejects content whose `byteSize` exceeds `MAX_MATERIAL_CONTENT_BYTES`
   with `content_too_large`. Oversized content is rejected, never truncated.
3. `content` must be non-empty after trimming for any write that sets content; an empty body
   is rejected with `validation_failed`. Omitting content entirely at source intake or
   acceptance is allowed (content is optional).
4. Source raw content is stored one row per Program source, keyed by `sourceId`. `PUT
   /sources/{sourceId}/content` creates or replaces it; replacement overwrites in place
   (source raw content is not revisioned).
5. `PUT`, `DELETE` on source content and content carried on source intake require a valid
   session for an effective Program Curator of the source's Program and a valid
   `X-Agonara-CSRF` header.
6. `GET /sources/{sourceId}/content` requires effective Program Curator participation for
   the source's Program. Non-curator participation is rejected with
   `admin_or_curator_required` (the existing curator-gate reason); a missing source is
   rejected with `source_not_found`.
7. `DELETE /sources/{sourceId}/content` hard-deletes the source raw content row. It must not
   modify, delete, or invalidate any accepted material content, accepted revision, or
   student-referenced record. Deleting absent source content is idempotent and accepted.
8. The source record (`program_sources` row, metadata, and `source_ids_json` provenance
   edges) is not deletable by this spec; its removal follows the withdrawal/tombstone rule
   and is specified jointly with the "Authorized deletion of corpus sources" backlog item.
9. Accepted material content is stored one row per accepted `material_reference` revision,
   keyed by `revisionId`, as a self-contained copy of `content`. It must not be stored as,
   or resolved through, a live reference into source raw content at read time.
10. Accepting a `material_reference` candidate with `content` stores that content against the
    revision created by the acceptance (new entity revision or replacement revision per the
    navigation acceptance rules). Editing accepted material content is done only by accepting
    a replacement revision; an existing revision's content is never overwritten.
11. Accepted material content for a revision referenced by student attempts, feedback, or
    progress evidence remains addressable and byte-identical for the life of that revision.
    Hard erasure or withdrawal of evidenced accepted content is out of scope for this spec
    and defers to the accepted-entity withdrawal work.
12. `GET …/content` returns the full content when `limit` is omitted. When `limit` is
    present (a positive integer character count, capped at `MAX_MATERIAL_CONTENT_BYTES`) it
    returns at most `limit` characters starting at the cursor position, with `nextCursor` set
    when more content remains; `byteSize` always reports the full content size. An absent
    `cursor` starts at offset 0; a `cursor` that does not resolve to a valid offset for the
    addressed content, or a non-positive `limit`, is rejected with `validation_failed`.
13. `GET /materials/{entityId}/content` serves the content of the entity's current accepted
    revision; `GET /materials/revisions/{revisionId}/content` serves the content of the named
    revision. Both require effective Student or Program Curator participation for the Program
    and do not require CSRF. A request for a material with no stored content is rejected with
    `content_not_found`.
14. Content reads must not create, update, or delete Student Workspace state (viewing
    history, last position, progress, mastery, weak areas, attempts, answers, evidence).
15. Content read projections expose only `content`, `contentFormat`, `byteSize`, and
    `nextCursor`. They must not expose source ids, candidate ids, curator rationale,
    accepted-by identity ids, acceptance timestamps, filesystem paths, session ids, CSRF
    tokens, cookies, SQL text, stack traces, or infrastructure details.
16. Student-safe and curator material navigation projections include `hasContent`, and when
    `hasContent` is true also `contentBytes` and `contentFormat`. Navigation traversal reads
    must not include the content bytes themselves.
17. `locator` and `citation` remain provenance metadata; they are never read to resolve or
    serve stored content.
18. Agonara does not validate, gate, or record licensing for stored content. The curator
    warrants rights at load time; no rule rejects content on licensing grounds.
19. Backup must preserve source raw content rows and accepted material content rows,
    including `contentFormat`, `byteSize`, and `sourceContentProvenance`.
20. Restore must reject a backup before mutation when a source content row references a
    missing source, an accepted material content row references a missing or
    non-`material_reference` accepted revision, a `contentFormat` is outside the enforced
    vocabulary, `byteSize` disagrees with `content`, or `byteSize` exceeds
    `MAX_MATERIAL_CONTENT_BYTES`.
21. This spec adds the rejection reason `content_too_large` and `content_not_found` to the
    shared rejection vocabulary and does not change existing rejection reasons.
22. This spec amends [navigation spec #28](topic-concept-material-navigation.md): material
    content is served through the dedicated content read surface above, not through
    navigation traversal; navigation still does not fetch, scrape, or transform external
    content, and a material reference remains a locator, citation, or concise body — now
    optionally accompanied by stored content served off the content routes.

## Product Intent changes (required)

23. Add a curator story: a Program Curator loads or derives readable material content into a
    Program and warrants the rights to store and share it, so students can read the material
    in-product.
24. Add a student story: a Student reads the full text of an accepted material in-product
    while keeping the link back to the topics and concepts it supports.
25. Amend `STU-09` and `CUR-03` to state that a material may be **linked or hosted**;
    `CUR-01` and `CUR-07` (external sources) are unchanged.

## Tests (required)

1. Storage test stores and reads source raw content keyed by `sourceId` and overwrites it on
   replace.
2. Storage test stores accepted material content keyed by `revisionId`, preserves it
   byte-identical after a replacement revision is accepted, and serves the prior revision's
   content unchanged.
3. Storage test rejects a `contentFormat` outside `{markdown, plain_text}` via the `check`
   constraint.
4. Domain test rejects content whose UTF-8 `byteSize` exceeds `MAX_MATERIAL_CONTENT_BYTES`
   with `content_too_large`, and rejects blank content with `validation_failed`.
5. Domain test stores accepted content as a self-contained copy and proves a later edit or
   delete of the originating source raw content leaves accepted content unchanged.
6. HTTP test verifies `PUT`/`DELETE /sources/{sourceId}/content` require effective Program
   Curator participation and CSRF, that `PUT` returns a `SourceContentSummary` carrying no
   content bytes, and that `GET /sources/{sourceId}/content` rejects Student participation
   with `admin_or_curator_required`.
7. HTTP test verifies `DELETE /sources/{sourceId}/content` hard-deletes the raw blob, is
   idempotent when absent, and does not affect accepted material content.
8. HTTP test verifies `GET /materials/{entityId}/content` and
   `/materials/revisions/{revisionId}/content` are readable by Student and Curator only under
   effective participation (and rejected otherwise), and return `content_not_found` for a
   material with no stored content.
9. HTTP test verifies pagination: full content with no `limit`; a chunk plus `nextCursor`
   with `limit`; `byteSize` always reporting full size; and `validation_failed` for an
   unresolvable cursor.
10. HTTP test verifies content read projections expose only `content`, `contentFormat`,
    `byteSize`, and `nextCursor`, and leak no provenance, operational metadata, or secrets.
11. HTTP test verifies material navigation projections carry `hasContent` (and
    `contentBytes`/`contentFormat` when present) while navigation traversal responses omit
    the content bytes.
12. Boundary test proves content reads create or mutate no Student Workspace state.
13. Backup/restore test round-trips source raw content and accepted material content with
    formats, byte sizes, and provenance pointers.
14. Backup/restore test rejects, before mutation, backups with a source-content row
    referencing a missing source, an accepted-content row referencing a missing or
    non-`material_reference` revision, an invalid `contentFormat`, a `byteSize` mismatch, and
    an oversized `byteSize`.
15. Browser test shows a student opening an accepted material and reading its full hosted
    content, with back-links to topics and concepts preserved.
16. Browser test shows a curator loading content for a source and reading it back; layout and
    accessibility checks verify named controls and no clipped text at desktop and mobile
    widths.

## Done criteria

- Source raw content and accepted material content are stored in Corpus Storage as text with
  an enforced `content_format` vocabulary and a soft byte ceiling.
- Effective Program Curators set, read, and hard-delete source raw content; effective
  Students and Curators read accepted material content through the dedicated, paginated,
  role-gated content routes.
- Accepted material content is a self-contained copy, immutable per revision, unaffected by
  source raw-content edits or deletion.
- Material navigation projections expose a `hasContent` signal while traversal stays
  content-free; navigation spec #28 is amended accordingly.
- Backup and restore preserve both content tables and reject malformed or oversized content
  graphs before mutation.
- Product Intent carries the new curator and student stories and the `STU-09`/`CUR-03`
  "linked or hosted" amendment.
- Agonara tests, root build, docs checks, and `git diff --check` pass after implementation.
