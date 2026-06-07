---
name: agonara-curator-corpus
author: Igor Malyarov
version: "1.0.0"
description: Operate as an Agonara program curator to assemble program structure — create a program, propose topics and concepts as corpus candidates, add material references and relationships through navigation candidates, keep drafts separate from accepted corpus, explicitly accept or reject candidates, read accepted corpus and revisions, and read corpus events. Use when a curator agent is building or refining the accepted structure of a program. The substrate the other curator skills (assessment, research) attach to.
trigger: when a curator agent needs to create a program or move topic/concept/material/navigation content between draft and accepted corpus
---

# Agonara curator — corpus

Assemble and accept program structure: the substrate every other curator job
attaches to. Covers creating a program, proposing content as **candidates**,
controlling the draft↔accepted boundary, and reading accepted corpus and
navigation.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for the instance
URL, login, the `agonara_session` cookie, the `X-Agonara-CSRF` header on every
mutation, and the `accepted`/`rejected`/`fault` envelope. This skill does not
repeat those mechanics. Program **membership** (who curates, who participates)
lives in [`agonara-membership`](../agonara-membership/SKILL.md) and the
[participation skill](../agonara-curator-participation/SKILL.md).

## The draft↔accepted model

Corpus content moves through one disciplined lifecycle, never auto-accepted
(CUR-06):

- A **candidate** is draft content with `status` `draft`, `accepted`, or
  `rejected`. It is *not* part of the program until you accept it.
- **Accepted corpus** is the controlled, student-reachable structure. Reaching
  it requires an explicit curator acceptance action — there is no implicit
  promotion.

Never present a `draft` (or `rejected`) candidate as accepted program content.

## Create and read a program

- **Create** — `POST /programs` with `{ "title", "description"? }`. This creates
  the program shell and your initial curator membership in one step. The
  envelope's `value` carries the new program's id.
- **List** — `GET /programs` (programs visible to your session).
- **Read one** — `GET /programs/{programId}`.

## Topics and concepts — corpus candidates

- **Propose** — `POST /programs/{programId}/corpus-candidates` with
  `{ "candidateKind", "title", "body"?, "sourceIds"?, "rationale"? }`.
  `candidateKind` is exactly `topic` or `concept`. Ground a candidate by listing
  the ids of sources you recorded via
  [`agonara-curator-research`](../agonara-curator-research/SKILL.md) in
  `sourceIds`, and record why it belongs in `rationale` (CUR-01…03).
- **List** — `GET /programs/{programId}/corpus-candidates`, optionally filtered
  by `status` (`draft`/`accepted`/`rejected`). Review drafts here before
  acceptance.
- **Accept** — `POST /corpus-candidates/{candidateId}/acceptance`. Optionally
  send `{ "targetEntityId" }` to revise an existing accepted entity rather than
  create a new one. This is the only path a candidate becomes accepted corpus.
- **Reject** — `POST /corpus-candidates/{candidateId}/rejection`.

Acceptance and rejection act only on a `draft` candidate; re-acting on one
already resolved returns a `rejected` reason such as `candidate_already_accepted`
or `candidate_already_rejected` (or `candidate_not_found`).

## Read accepted corpus

- **List accepted** — `GET /programs/{programId}/accepted-corpus`, optionally
  filtered by `acceptedKind` (`topic` / `concept`).
- **Read a revision** — `GET /accepted-corpus-revisions/{revisionId}` for the
  full detail of one accepted revision.
- **Audit trail** — `GET /programs/{programId}/corpus-events` (paged via
  `limit`/`cursor`) records how the accepted corpus changed over time.

## Navigation — linking materials to topics and concepts

Navigation is how accepted materials attach to topics and concepts so a student
knows why each material is included (CUR-03). It follows the same candidate
lifecycle:

- **Propose a topic or concept** —
  `POST /programs/{programId}/navigation-candidates` with
  `{ "candidateKind": "topic" | "concept", "title", "body"?, "sourceIds"?, "rationale"? }`.
- **Propose a material reference** — use the same route with
  `{ "candidateKind": "material_reference", "title", "materialReferenceKind", "body"?, "locator"?, "citation"?, "sourceIds"?, "rationale"? }`.
  `materialReferenceKind` is one of `article`, `book`, `course`, `lecture`,
  `note`, `problem_set`, `standard`, `video`, or `other`; provide at least one
  of `body`, `locator`, or `citation`.
- **Propose a definition or principle** — use `candidateKind` `definition` or
  `principle` and provide a non-empty `body`.
- **Propose relationship changes** — use `candidateKind:
  "relationship_update"` and a non-empty `relationshipDrafts` array. Each
  draft names a `relationshipKind` and exactly one source and destination
  selector (`fromEntityId`/`fromCandidateRef: "self"` and
  `toEntityId`/`toCandidateRef: "self"`); optional fields are `label`,
  `rationale`, and `sourceIds`.
- **List candidates** — `GET /programs/{programId}/navigation-candidates`
  (filter by `status`).
- **Accept / reject** — `POST /navigation-candidates/{candidateId}/acceptance`,
  `POST /navigation-candidates/{candidateId}/rejection`.
- **Read accepted navigation** — `GET /programs/{programId}/navigation` (the
  student-safe accepted structure), `GET /navigation/entities/{entityId}`,
  `GET /navigation/revisions/{revisionId}`.

Navigation guards relationship integrity: expect `rejected` reasons like
`navigation_prerequisite_cycle`, `navigation_relationship_self_reference`, or
`navigation_relationship_endpoint_kind_mismatch` when a proposed link is
inconsistent. Honor the reason; do not retry unchanged.

## Boundaries this skill keeps

- **Accepted changes preserve student state (CUR-10).** Updating the program
  after research evolves the corpus; it does **not** erase or overwrite student
  attempts, progress, or learning history. The API keeps corpus and student
  state separate — never reach into student state from a corpus operation, and
  never read private student learning data (that is not a curator capability).
- **Acceptance is always explicit.** Do not auto-accept generated or extracted
  content; a human-owned acceptance action is the contract (CUR-06).
- **Checks, criteria, sources, and suggestions live elsewhere.** Authoring
  checks and assessment criteria is
  [`agonara-curator-assessment`](../agonara-curator-assessment/SKILL.md);
  recording external sources, reading coverage gaps, and LLM suggestions are
  [`agonara-curator-research`](../agonara-curator-research/SKILL.md). This skill
  references their output (e.g. `sourceIds`) but does not perform their jobs.
