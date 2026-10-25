---
date: 2026-06-03
model: gpt-5
description: "Spec: Agonara topic, concept, and material navigation."
version: 0.0.2
status: implemented
type: spec
---

# Topic, Concept, and Material Navigation

## Goal

Define the accepted Program corpus navigation contract, owned by Corpus Storage with curator acceptance through Curator Workspace, so effective Students can traverse accepted topics, concepts, definitions, principles, and linked materials without creating learner state.

## Implementation status

Implemented in [Topic, Concept, and Material Navigation Implementation Plan](../plans/implemented/topic-concept-material-navigation.md).

Primary implementation and verification:

- [Storage and backup/restore](../../src/storage.js), with graph invariant coverage in [storage tests](../../tests/storage.test.js) and [backup/restore tests](../../tests/backup-restore.test.js).
- [Corpus domain commands and student-safe queries](../../src/corpus.js), with domain coverage in [Corpus tests](../../tests/corpus.test.js) and [Corpus executable acceptance](../../tests/corpus-executable-acceptance.test.js).
- [HTTP route adapter](../../src/server.js), with route coverage in [http-api-navigation.test.js](../../tests/http-api-navigation.test.js) and [HTTP executable acceptance](../../tests/executable-acceptance.test.js).
- [`/learn` product UI](../../src/learn-ui.js), with browser coverage in [navigation Playwright tests](../../tests/topic-concept-material-navigation.playwright.js).

## Public interface

### Shared kinds

```ts
type NavigationCorpusKind =
  | "topic"
  | "concept"
  | "definition"
  | "principle"
  | "material_reference";

type NavigationCandidateKind =
  | NavigationCorpusKind
  | "relationship_update";

type NavigationRelationshipKind =
  | "topic_includes_concept"
  | "topic_uses_material"
  | "concept_uses_material"
  | "concept_has_definition"
  | "concept_has_principle"
  | "concept_prerequisite"
  | "concept_related"
  | "concept_distinguishes_from";

type MaterialReferenceKind =
  | "article"
  | "book"
  | "course"
  | "lecture"
  | "note"
  | "problem_set"
  | "standard"
  | "video"
  | "other";
```

### Candidate and acceptance shapes

```ts
type NavigationRelationshipDraft = {
  relationshipKind: NavigationRelationshipKind;
  fromEntityId?: string;
  fromCandidateRef?: "self";
  toEntityId?: string;
  toCandidateRef?: "self";
  label?: string;
  rationale?: string;
  sourceIds?: string[];
};

type CreateNavigationCandidateRequest = {
  candidateKind: NavigationCandidateKind;
  title: string;
  body?: string;
  materialReferenceKind?: MaterialReferenceKind;
  locator?: string;
  citation?: string;
  sourceIds?: string[];
  rationale?: string;
  relationshipDrafts?: NavigationRelationshipDraft[];
};

type AcceptNavigationCandidateRequest = {
  targetEntityId?: string;
};

type NavigationCandidateSummary = {
  candidateId: string;
  programId: string;
  candidateKind: NavigationCandidateKind;
  title: string;
  body?: string;
  materialReferenceKind?: MaterialReferenceKind;
  locator?: string;
  citation?: string;
  sourceIds: string[];
  relationshipDrafts: NavigationRelationshipDraft[];
  rationale?: string;
  status: "draft" | "accepted" | "rejected";
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedNavigationRelationshipSummary = {
  relationshipId: string;
  relationshipRevisionId: string;
  programId: string;
  relationshipKind: NavigationRelationshipKind;
  fromEntityId: string;
  fromRevisionId: string;
  fromKind: NavigationCorpusKind;
  toEntityId: string;
  toRevisionId: string;
  toKind: NavigationCorpusKind;
  label?: string;
  sourceIds: string[];
  acceptedFromCandidateId: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};

type AcceptedNavigationCorpusSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  acceptedKind: NavigationCorpusKind;
  title: string;
  body?: string;
  materialReferenceKind?: MaterialReferenceKind;
  locator?: string;
  citation?: string;
  sourceIds: string[];
  acceptedFromCandidateId: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};

type AcceptedNavigationChange = {
  acceptedCorpus?: AcceptedNavigationCorpusSummary;
  acceptedRelationships: AcceptedNavigationRelationshipSummary[];
};
```

### Student-safe read shapes

```ts
type ProgramNavigationSummary = {
  programId: string;
  topics: AcceptedNavigationNodeSummary[];
  ungroupedConcepts: AcceptedNavigationNodeSummary[];
  ungroupedMaterials: AcceptedNavigationNodeSummary[];
};

type AcceptedNavigationNodeSummary = {
  entityId: string;
  revisionId: string;
  acceptedKind: NavigationCorpusKind;
  title: string;
};

type StudentNavigationRelationshipSummary = {
  relationshipId: string;
  relationshipRevisionId: string;
  relationshipKind: NavigationRelationshipKind;
  fromEntityId: string;
  fromRevisionId: string;
  fromKind: NavigationCorpusKind;
  fromTitle: string;
  toEntityId: string;
  toRevisionId: string;
  toKind: NavigationCorpusKind;
  toTitle: string;
  label?: string;
};

type StudentNavigationNodeDetail = {
  entityId: string;
  revisionId: string;
  programId: string;
  acceptedKind: NavigationCorpusKind;
  title: string;
  body?: string;
  materialReferenceKind?: MaterialReferenceKind;
  locator?: string;
  citation?: string;
  relationships: {
    outgoing: StudentNavigationRelationshipSummary[];
    incoming: StudentNavigationRelationshipSummary[];
  };
};

type StudentNavigationRevisionDetail = {
  entityId: string;
  revisionId: string;
  programId: string;
  acceptedKind: NavigationCorpusKind;
  title: string;
  body?: string;
  materialReferenceKind?: MaterialReferenceKind;
  locator?: string;
  citation?: string;
  isCurrentRevision: boolean;
};
```

Student-safe read projections omit `sourceIds`, `acceptedFromCandidateId`, `acceptedByIdentityId`, `acceptedAt`, curator rationale, draft status, candidate ids, and operational metadata.

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `GET` | `/programs/{programId}/navigation-candidates?status={status}&limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<{ navigationCandidates: NavigationCandidateSummary[]; nextCursor?: string }>` |
| `POST` | `/programs/{programId}/navigation-candidates` | Program Curator session and CSRF header | `AcceptedResult<{ navigationCandidate: NavigationCandidateSummary }>` |
| `POST` | `/navigation-candidates/{candidateId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ navigationChange: AcceptedNavigationChange }>` |
| `POST` | `/navigation-candidates/{candidateId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ navigationCandidate: NavigationCandidateSummary }>` |
| `GET` | `/programs/{programId}/navigation` | Student, Program Curator, or Admin session | `AcceptedResult<{ navigation: ProgramNavigationSummary }>` |
| `GET` | `/navigation/entities/{entityId}` | Student, Program Curator, or Admin session | `AcceptedResult<{ navigationNode: StudentNavigationNodeDetail }>` |
| `GET` | `/navigation/revisions/{revisionId}` | Student, Program Curator, or Admin session | `AcceptedResult<{ navigationRevision: StudentNavigationRevisionDetail }>` |

The navigation-candidate endpoints extend the existing Corpus candidate model for Phase 2 without changing the Phase 1 `/corpus-candidates` and `/accepted-corpus` contracts.

## Behavior rules

1. Navigation candidates, relationship drafts, accepted navigation entities, and accepted navigation relationships are scoped to exactly one Program.
2. State-changing navigation endpoints require a valid session for an effective Program Curator and a valid `X-Agonara-CSRF` header.
3. Student-safe navigation reads require effective participation in the Program and do not require CSRF.
4. `candidateKind` must be one of `topic`, `concept`, `definition`, `principle`, `material_reference`, or `relationship_update`.
5. `title` must be non-empty after trimming for every candidate kind.
6. `body` must be non-empty after trimming for `definition` and `principle` candidates.
7. `material_reference` candidates must include `materialReferenceKind` and at least one of `locator`, `citation`, or `body`.
8. `relationship_update` candidates must include at least one relationship draft and must not create an accepted corpus entity.
9. `sourceIds` and relationship-draft `sourceIds` must reference Program sources in the same Program.
10. A relationship draft must resolve both endpoints from either an existing accepted entity id or the accepted entity created by the same candidate through `fromCandidateRef: "self"` or `toCandidateRef: "self"`.
11. A non-`relationship_update` candidate may use `self` for exactly one endpoint in each relationship draft. A `relationship_update` candidate must use existing accepted entity ids for both endpoints. A relationship draft that resolves both endpoints to the same entity is rejected.
12. A relationship draft must not resolve to draft, rejected, missing, cross-Program, or wrong-kind endpoints.
13. Relationship kinds are valid only for these endpoint pairs:
    - `topic_includes_concept`: topic to concept;
    - `topic_uses_material`: topic to material reference;
    - `concept_uses_material`: concept to material reference;
    - `concept_has_definition`: concept to definition;
    - `concept_has_principle`: concept to principle;
    - `concept_prerequisite`: concept to concept;
    - `concept_related`: concept to concept;
    - `concept_distinguishes_from`: concept to concept.
14. `concept_prerequisite` relationships must not introduce a cycle in the accepted current graph.
15. Acceptance of a navigation candidate is atomic: if entity creation, entity revision replacement, or any relationship acceptance fails, no candidate status, accepted entity, accepted revision, relationship, or event record is mutated.
16. Accepting a non-`relationship_update` candidate without `targetEntityId` creates a new accepted navigation entity and stable current revision.
17. Accepting a non-`relationship_update` candidate with `targetEntityId` creates a replacement revision only when the target entity exists in the same Program and has the same accepted kind as the candidate.
18. Accepted historical revisions remain addressable after replacement through `GET /navigation/revisions/{revisionId}`.
19. Accepted relationships store stable relationship ids and stable relationship revision ids and resolve to the current accepted revisions of their endpoint entities for student navigation reads.
20. Updating a topic, concept, definition, principle, material reference, or relationship must not erase student attempts, answers, evidence, progress summaries, weak-area summaries, or learning history.
21. Student-safe navigation read endpoints must not create, update, or delete Student Workspace state, including viewing history, last position, progress, mastery, weak areas, attempts, answers, or evidence.
22. Program navigation lists include current accepted topics, current ungrouped concepts, and current ungrouped material references. A concept is ungrouped when it has no accepted current `topic_includes_concept` incoming relationship. A material reference is ungrouped when it has no accepted current `topic_uses_material` or `concept_uses_material` incoming relationship.
23. Topic detail includes outgoing accepted current concepts and materials. Concept detail includes linked definitions, principles, prerequisites, related concepts, distinctions, and materials. Material detail includes incoming topics and concepts so a student can navigate back to the structure it supports.
24. Student-safe projections must not expose source ids, candidate ids, curator rationale, accepted-by identity ids, acceptance timestamps, draft/rejected candidates, rejected relationships, source ingestion internals, session ids, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, provider details, or infrastructure details.
25. Curator projections may expose candidate ids, relationship drafts, curator rationale, accepted-by identity ids, acceptance timestamps, and source ids when the actor is an effective Program Curator.
26. Backup and restore must preserve navigation candidates, accepted navigation entities, accepted navigation revisions, accepted navigation relationships, relationship revisions, source links, candidate provenance, and current-revision pointers.
27. Restore must reject malformed navigation graphs before mutation when records reference missing entities, missing revisions, missing candidates, cross-Program sources, cross-Program relationship endpoints, invalid relationship kinds, wrong endpoint kinds, missing current revisions, or a `concept_prerequisite` cycle.
28. Navigation traversal does not fetch, scrape, copy, upload, transform, or summarize external material content, and a material reference remains an accepted locator, citation, or concise body. Stored material content (per [Material Content Storage](material-content-storage.md), ADR-021) is served off a dedicated content route, not through navigation traversal; navigation material projections carry only a `hasContent` signal (with `contentBytes`/`contentFormat` when present), never the content bytes.
29. This spec does not add topic-level checks, period-level checks, learner-state interpretation, weak-area interpretation, resume/last-position recording, recommendation ranking, LLM-assisted curation, provider calls, source extraction, or collaborative editing. Material content storage and serving are owned by [Material Content Storage](material-content-storage.md) (ADR-021); material licensing is the curator's responsibility per ADR-021.

## Tests (required)

1. Storage test creates and lists accepted topic, concept, definition, principle, and material-reference entities with stable current revision ids.
2. Storage test creates accepted relationships for every valid relationship kind and rejects each wrong endpoint-kind pair.
3. Storage test rejects cross-Program sources and cross-Program relationship endpoints.
4. Storage test rejects `concept_prerequisite` cycles.
5. Storage test preserves historical accepted navigation revisions after replacement.
6. Domain test rejects invalid navigation candidates for unsupported kind, blank title, blank required body, missing material reference target data, malformed relationship drafts, and unknown source ids.
7. Domain test accepts a topic or concept candidate and atomically creates the accepted entity, current revision, relationships, candidate status, and corpus event.
8. Domain test accepts a `relationship_update` candidate and creates only accepted relationships without creating an accepted corpus entity.
9. Domain test proves failed acceptance leaves candidate status, accepted entities, accepted revisions, accepted relationships, and events unchanged.
10. HTTP test verifies navigation candidate create/list/accept/reject routes require effective Program Curator participation and CSRF for mutations.
11. HTTP test verifies Student, Curator, and Admin participants can read `/programs/{programId}/navigation`, `/navigation/entities/{entityId}`, and `/navigation/revisions/{revisionId}` only when effective participation allows the read.
12. HTTP test verifies Student-safe navigation reads omit source ids, candidate ids, curator rationale, accepted-by identity ids, acceptance timestamps, draft/rejected candidates, operational metadata, and secrets.
13. HTTP test verifies material detail returns linked incoming topics and concepts for material-to-structure back navigation.
14. HTTP test verifies historical navigation revision reads return `isCurrentRevision: false` after replacement and omit relationship projections.
15. Boundary test proves navigation reads do not create or mutate Student Workspace viewing history, last position, progress, mastery, weak areas, attempts, answers, evidence, or events.
16. Backup/restore test round-trips a navigation graph with topics, concepts, definitions, principles, materials, relationships, replacements, and historical revisions.
17. Backup/restore test rejects malformed navigation graphs for missing references, cross-Program links, wrong endpoint kinds, missing current revisions, and prerequisite cycles before mutation.
18. Browser test shows Program coverage from accepted topics, concepts, and materials without creating student state.
19. Browser test opens a topic, follows a concept, opens linked material, and navigates back to linked concepts or topics.
20. Browser test verifies Student navigation screens do not render curator-only provenance or operational metadata.
21. Browser layout and accessibility checks verify navigation screens have named controls and no overlapping or clipped text at desktop and mobile widths.

## Done criteria

- Accepted navigation entities support topics, concepts, definitions, principles, and material references with stable current and historical revisions.
- Accepted navigation relationships connect only valid same-Program current entities and reject malformed or cyclic graph states.
- Effective Program Curators can create, accept, reject, and inspect navigation candidates and relationship updates through HTTP routes.
- Effective Students can read Program coverage, topic detail, concept detail, material detail, linked materials, and material-to-structure back links through student-safe HTTP projections.
- Historical accepted navigation revisions remain readable through student-safe revision projections.
- Navigation reads do not create or mutate Student Workspace state.
- Backup and restore preserve valid navigation graphs and reject malformed graphs before mutation.
- Browser tests cover Program preview, topic traversal, concept traversal, material traversal, back navigation, redaction, accessibility, and desktop/mobile layout.
- Agonara tests, root build, docs checks, and `git diff --check` pass after implementation.
