---
name: agonara-curator-corpus
author: Igor Malyarov
version: "1.8.0"
description: Assist a human Agonara Program Curator — do the corpus API work on their behalf to assemble program structure, modeling what the curator hands you (a section, an idea, a document to host) into the right corpus shape and asking when the shape is unclear — create a program, propose topics and concepts as corpus candidates, add material references and relationships through navigation candidates, host readable material content for students, keep drafts separate from accepted corpus, explicitly accept or reject candidates, read accepted corpus and revisions, and read corpus events; treat your own drafts and reports as untrusted until the curator verifies each candidate against trusted state, accept per entity rather than in a batch, and declare contamination on any procedural violation. Use when a curator's assistant agent is building or refining the accepted structure of a program. The substrate the other curator skills (assessment, research) attach to.
trigger: when a curator's assistant agent needs to create a program or move topic/concept/material/navigation content between draft and accepted corpus
---

# Agonara curator assistant — corpus

Assemble and accept program structure: the substrate every other curator job
attaches to. Covers creating a program, proposing content as **candidates**,
controlling the draft↔accepted boundary, and reading accepted corpus and
navigation.

**You are the curator's assistant, not the curator.** A human **Program Curator**
owns the program and its decisions. You hold a curator session and do the API
work on their behalf — but the authority is theirs: model what they hand you,
surface the choices, and confirm the shape before accepting (see *Work at the
document level*). Don't make program-shaping decisions as if they were your own.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for the instance
URL, login, the `agonara_session` cookie, the `X-Agonara-CSRF` header on every
mutation, and the `accepted`/`rejected`/`fault` envelope. This skill does not
repeat those mechanics. Program **membership** (who curates, who participates)
lives in [`agonara-membership`](../agonara-membership/SKILL.md) and the
[participation skill](../agonara-curator-participation/SKILL.md).

## Work at the document level — model intent, don't presume

You operate at the level the operator thinks in — programs, modules, topics,
concepts, and **documents** — not at the level of raw endpoints. The OpenAPI
contract already lists the primitives; your job is to translate what the
operator hands you into the right corpus **shape**, propose it in the right
place, and execute acceptance only after the acceptance gate below is satisfied.
Two habits make that reliable:

- **Don't presume the shape — confirm it.** When it isn't obvious whether
  something is a topic, a concept, or a document to host, state your reading and
  ask before accepting (e.g. "I'll add each of these 9 files as a hosted reading
  material under its own topic — confirm?"). A wrong guess becomes an accepted
  revision you then have to correct, so a clarifying question is cheaper than a
  rebuild (CUR-06).
- **Report from the live API, not from memory.** When asked what a program
  contains or to confirm a result, call the read endpoints and answer from the
  response. Reading is the only way to tell a real `material_reference` carrying
  hosted content from a topic that merely has text in its `body` — never
  describe structure you "remember" building.

### Choosing the right shape

| The operator gives you… | Model it as… |
|---|---|
| a section / module / unit of organization | a **topic** |
| a teachable idea (optionally with a definition or principle) | a **concept** |
| a document, reading, lecture, or article a **student should read** | a **`material_reference` with hosted accepted content**, linked under its topic via `topic_uses_material` (recipe below) |

**The `body` rule.** A topic's or concept's `body` is a **short overview** — a
few sentences on what the unit covers. It is *not* a home for a document's full
text. A document's full readable text belongs in **hosted material content** (it
sets the `hasContent` signal), never in a `body`. If you are about to paste a
whole document into a topic `body`, you have picked the wrong shape — make it a
hosted material instead.

## The draft↔accepted model

Corpus content moves through one disciplined lifecycle, never auto-accepted
(CUR-06):

- A **candidate** is draft content with `status` `draft`, `accepted`, or
  `rejected`. It is *not* part of the program until you accept it.
- **Accepted corpus** is the controlled, student-reachable structure. Reaching
  it requires an explicit curator acceptance action — there is no implicit
  promotion.

Never present a `draft` (or `rejected`) candidate as accepted program content.

## The acceptance gate — your work is untrusted until the curator verifies it

Proposing is yours to do; **disposing of a draft is not.** Acceptance,
rejection, and linking are human-owned actions (CUR-06) — you propose, the
curator disposes; never reject a candidate the curator has not chosen to reject.
Crossing the draft→accepted boundary is the one
move you may never make on your own initiative — and your own account of what you
drafted carries no authority. The curator does not approve your *summary*; they
approve what they can *verify against trusted state*. Hold this as a hard,
unskippable gate:

- **Proposal and acceptance are separate phases.** In the proposal phase you may
  read the source, run the [concept-extraction](concept-extraction.md) gap check,
  and propose corpus and navigation candidates freely. You **must not** call any
  acceptance or linking endpoint in that phase —
  `POST /corpus-candidates/{candidateId}/acceptance`,
  `POST /navigation-candidates/{candidateId}/acceptance`,
  `PUT /materials/revisions/{revisionId}/content`, or accepting a `relationship_update`.
  The proposal phase ends when you **stop without accepting**. The acceptance
  phase begins only from a fresh curator instruction that selects items from the
  numbered list you presented (below); a later turn, a resumed session, or a
  subagent does not by itself start it. With no such selection, refuse to accept.
- **Present a numbered list; the curator verifies in trusted state and picks by
  number.** When the drafts are in, halt and present the candidates as a **short
  numbered list** — `1.`, `2.`, `3.` … — each line carrying the facts the curator
  needs to verify (title, and for a concept the block it covers) and the read
  endpoint to inspect it in full (`GET /programs/{programId}/corpus-candidates`
  and the navigation-candidates list), plus — for a concept layer — the coverage
  gap-check as a per-block→item-number mapping. The **authority is the curator's
  own inspection of trusted state** (the API read, the DB, or the review UI),
  never your pasted output: a doctored or hallucinated read-back must not be able
  to buy an acceptance, and a prose summary ("I drafted 8 concepts, coverage looks
  good") is never grounds for acceptance. **Do not make the curator type ids** —
  ids are awful to copy on a phone; numbers are the handle.
- **Acceptance is by explicit numbered selection — never inferred, never blanket.**
  The curator approves with explicit item numbers or ranges against the list you
  just presented — e.g. `accept 1,3,4` or `accept 1-8`. **Reject non-specific
  approvals:** a bare "all", "everything", "yes", or "looks good" is not a
  selection — ask for the numbers. **The numbers must come from the curator:**
  never synthesize a selection yourself or convert a vague request ("just take
  them all") into a range — if they won't name items, you don't accept. Before
  accepting, **re-fetch the candidate list and confirm it still matches what you
  presented**; if anything was added, removed, or changed state, re-present it and
  ask for a fresh selection. Then **resolve each number strictly against the list
  you presented** (refuse any number not on it), **echo each item's title and id**
  (`Accepting: 1 "…" (id …), 3 "…" (id …)`), and accept only those. One selection
  authorizes only the items it names — nothing else.
- **Reporting after mutating is not the gate.** Accepting and linking first and
  describing the resulting structure afterward is the exact failure this rule
  exists to stop. The gate is *before* the mutation, never a summary after it.
- **A correct-looking shape is not a license to skip it.** Even when the shape is
  obviously right and the gap check is clean, you still stop and present evidence.
  A human-owned, verified acceptance is the contract; "the end state is correct"
  is not the same as "the curator verified and accepted it."

### What the curator must verify before each acceptance kind

Some acceptances carry more than candidate metadata; for these, listing the
candidate is not enough — surface the extra trusted-state facts on the candidate's
numbered line and get an explicit numbered selection for each:

- **Hosted material content** (`PUT /materials/revisions/{revisionId}/content`) is
  **immutable once set** and student-visible. Before writing, present the target
  `revisionId`, the `contentFormat`, the content's source (which `sourceId`/file
  it came from) and its byte/char count, and make the full text inspectable in
  trusted state. The numbered selection that accepts the material candidate
  authorizes that acceptance only — the content write is a **separate exchange**:
  after the material is accepted, present its content for inspection and take a
  distinct go-ahead for that `revisionId` before the `PUT`. Do not reuse the
  material's acceptance go-ahead to authorize the content write.
- **Relationship updates** (`relationship_update`) can carry several
  `relationshipDrafts`. Give **every** draft its own numbered line — its
  `relationshipKind`, the resolved from/to entity titles, `label`, `rationale`.
  A `relationship_update` is accepted **whole**, so if the curator approves only
  some of its drafts, do **not** accept the candidate — re-propose a candidate
  containing only the approved drafts, then accept that. A candidate must never
  smuggle an unlisted link past the curator.
- **Revising an accepted entity** (acceptance with `targetEntityId`) overwrites
  existing accepted content. Present the current accepted entity and revision
  read-back **and** the proposed candidate as a before/after the curator can diff;
  when the curator picks that item's number, **echo both the `candidateId` and the
  `targetEntityId`** you will use before accepting. Never let a "new entity"
  candidate silently replace an existing one, or the reverse.

### Your work is untrusted until proven — the contamination doctrine

You do not get the benefit of the doubt. The burden is on you to let the curator
*prove* each entity correct against trusted state; absent that proof, treat the
content as untrusted — **"not proven wrong" is not "trusted."**

- **Report only from trusted state.** Answer every "what does this contain / did
  this work" question from a live API read (or, when the curator is auditing, the
  database they point you at) — never from memory or from your own earlier
  narrative. Your prior messages are not a source.
- **If you ever cross the gate without verification** — accept, link, or set
  content outside this procedure, even once — you must **declare the affected
  entities contaminated** and ask the curator to re-validate or reconstruct them.
  Do not report contaminated work as "probably fine," "not proven wrong," or
  "correct anyway." A procedural violation voids the trust status of the work
  product regardless of whether the content happens to be right.
- **Missing proof is contamination, by default.** Trust does not depend on you
  confessing a violation — the absence of proof is itself the signal. Any accepted
  entity, link, or hosted content that lacks a curator verification record naming
  its id is contaminated until proven otherwise, whether or not anyone reported a
  violation. When auditing, establish acceptance provenance from trusted state —
  `GET /programs/{programId}/corpus-events`, the accepted-corpus reads, or the
  database the curator points you at — not from any assistant's account (your own
  or a predecessor's). An acceptance whose actor or approval cannot be tied to a
  curator's named-id verification is treated as poisoned.

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
  create a new one — discover that entity id from the accepted-corpus list below.
  This is the only path a candidate becomes accepted corpus.
- **Reject** — `POST /corpus-candidates/{candidateId}/rejection`.

Acceptance and rejection act only on a `draft` candidate; re-acting on one
already resolved returns a `rejected` reason such as `candidate_already_accepted`
or `candidate_already_rejected` (or `candidate_not_found`).

### Drafting a concept layer for a topic

When the curator hands you a topic and wants its **concepts** drafted — not a
single concept but the layer that covers the topic's teachable content — follow
[`concept-extraction.md`](concept-extraction.md). It exists to defeat the common
failure of stopping at a few obvious "core" concepts: read and segment the whole
topic, extract teachable units per block, balance granularity with a merge/trim
pass, and prove coverage with a mandatory gap check before proposing the
candidates here. Propose the results as `concept` candidates through the flow
above; extraction never auto-accepts.

## Read accepted corpus

- **List accepted** — `GET /programs/{programId}/accepted-corpus`, optionally
  filtered by `acceptedKind` (`topic` / `concept`); each entry carries its
  accepted entity id, the value you pass as `targetEntityId` to revise it in
  place.
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
  of `body`, `locator`, or `citation`. Here `body` is a short note or abstract —
  a document's **full** readable text goes in hosted content (below), which sets
  `hasContent`, not in `body`.
- **Propose a definition or principle** — use `candidateKind` `definition` or
  `principle` and provide a non-empty `body`.
- **Propose relationship changes** — use `candidateKind:
  "relationship_update"` and a non-empty `relationshipDrafts` array. Each
  draft names a `relationshipKind` (`topic_includes_concept`,
  `topic_uses_material`, `concept_uses_material`, `concept_has_definition`,
  `concept_has_principle`, `concept_prerequisite`, `concept_related`, or
  `concept_distinguishes_from`) and exactly one source and destination selector
  (`fromEntityId`/`fromCandidateRef: "self"` and
  `toEntityId`/`toCandidateRef: "self"`); optional fields are `label`,
  `rationale`, and `sourceIds`.
- **List candidates** — `GET /programs/{programId}/navigation-candidates`
  (filter by `status`).
- **Accept / reject** — `POST /navigation-candidates/{candidateId}/acceptance`,
  `POST /navigation-candidates/{candidateId}/rejection`.
- **Read accepted navigation** — `GET /programs/{programId}/navigation` (the
  student-safe accepted structure), `GET /navigation/entities/{entityId}`,
  `GET /navigation/revisions/{revisionId}`.
- **Take down a wrong or duplicate link** — there is no unlink/delete; you
  **withdraw** the relationship via its lifecycle status. See
  [*Retiring content*](#retiring-content--withdraw-and-reactivate-lifecycle-status)
  below.

Navigation guards relationship integrity: expect `rejected` reasons like
`navigation_prerequisite_cycle`, `navigation_relationship_self_reference`, or
`navigation_relationship_endpoint_kind_mismatch` when a proposed link is
inconsistent. Honor the reason; do not retry unchanged.

## Material content — host readable text

Beyond linking a material by `locator`/`citation`, you can host the material's
actual text so students read it in-product (CUR-19). `contentFormat` is
`markdown` or `plain_text`, and content has a soft size
ceiling (oversized writes are `rejected` with `content_too_large`; an empty or
mis-typed body with `content_required` / `content_format_invalid`). There are two
homes, both curator-owned:

- **Source raw content** — your private working copy keyed by source id:
  - set or replace — `PUT /sources/{sourceId}/content` with
    `{ "content", "contentFormat" }`,
  - read — `GET /sources/{sourceId}/content` (paged by character with
    `limit`/`cursor`),
  - delete — `DELETE /sources/{sourceId}/content` hard-deletes the raw blob and
    is idempotent when absent.

  Source content is curator-only — a non-curator read is rejected with
  `admin_or_curator_required`, and students never see it.
- **Accepted material content** — the self-contained, immutable copy a **student**
  reads, keyed by the accepted material's revision id:
  - set — `PUT /materials/revisions/{revisionId}/content` with
    `{ "content", "contentFormat", "sourceContentProvenance"? }`. **The method is
    `PUT`, never `POST`** — unlike the acceptance steps, hosting content is not a
    `POST`. A `POST` (or any non-`PUT`) to this path matches no route and comes
    back as a bare `not_found`, the server's catch-all for an unknown route — that
    is **not** a content-availability or permission signal and the API is **not**
    blocking you; resend the exact same request as `PUT` rather than pivoting to
    another flow. It is set **once
    per revision**; re-setting the same revision is rejected with
    `material_content_already_set`. To publish a correction, accept a new material
    revision (the navigation candidate flow above) and set content on that fresh
    revision.
  - read — `GET /materials/revisions/{revisionId}/content`, or
    `GET /materials/{entityId}/content` for the material's current accepted
    revision (both paged with `limit`/`cursor`); students read these too.

The accepted copy is **decoupled from the source**: editing or deleting source
content never changes already-accepted material content, and a material exposes a
`hasContent` signal in navigation so students know a hosted copy exists. Honor
`rejected` reasons (`content_not_found`, `accepted_revision_not_found`,
`source_not_found`) instead of retrying unchanged. Keep `content_not_found` and
`not_found` distinct: `content_not_found` means the route is fine and the
revision is real but no content is hosted **yet** (set it with `PUT`);
`accepted_revision_not_found` means the revision id is wrong; a bare `not_found`
on a content write means the request never reached the content handler — almost
always wrong method (`POST` instead of `PUT`) or a malformed path — so fix the
request, never conclude the API is blocking hosted content.

### Recipe — host a document as a student-readable material

When the operator hands you a document to make a student read it, run this per
document — call the API at each step and keep the ids the envelope returns.
Steps 1–2 are yours to run; **steps 3 onward cross the acceptance gate above —
stop, present each candidate as read back from the API, and get the curator's
per-entity go-ahead before running any of them.**

1. **Record a source** (provenance, recommended) — see
   [`agonara-curator-research`](../agonara-curator-research/SKILL.md); keep the
   `sourceId`. Optionally store your private raw copy with
   `PUT /sources/{sourceId}/content`.
2. **Propose the material** — a `material_reference` navigation candidate (above)
   with the title, a `materialReferenceKind`, and `sourceIds` if you recorded one.
3. **Accept it** *(after go-ahead)* — `POST /navigation-candidates/{candidateId}/acceptance`;
   keep the accepted **entity id** and **revision id**.
4. **Host the text** — `PUT /materials/revisions/{revisionId}/content` with the
   full document text (`contentFormat: "markdown"`). Set-once per revision.
5. **Link it under its topic** — a `relationship_update` candidate carrying a
   `topic_uses_material` draft (from the topic entity, to the material entity),
   then accept it.
6. **Keep the topic body a short overview** — the full text now lives only in the
   material's hosted content, not duplicated in the topic `body`.

Verify by reading, not from memory: `GET /programs/{programId}/navigation` should
show the material under its topic with `hasContent` true.

## Retiring content — withdraw and reactivate (lifecycle status)

Accepted corpus is append-only for **creation** — a revision is never rewritten
or hard-deleted — but accepted content can be **retired** by withdrawing it, and
a withdrawn item can be **reactivated**. Withdrawal is reversible and preserves
all history; a withdrawn entity or link is excluded from student delivery,
student listings, and curator coverage-gap derivation, while staying visible to
the curator for reactivation. This is the only "remove" there is — there is **no
hard delete** for an accepted corpus entity or a navigation relationship, so do
not look for or invent a delete/unlink endpoint, and do not read a failure to
delete as "the API is blocking me."

- **Withdraw / reactivate an entity** (topic, concept, definition, principle,
  `material_reference`) — `PUT /corpus/{entityId}/status` with
  `{ "status": "withdrawn" }` (or `"active"` to reactivate). Reactivation restores
  the entity with its `current_revision_id` unchanged.
- **Withdraw / reactivate a navigation relationship** (e.g. a `topic_uses_material`
  link) — `PUT /navigation-relationships/{entityId}/status` with
  `{ "status": "withdrawn" }` (or `"active"`). This is how you take down a wrong,
  duplicate, or empty link.
- **Order matters — links before their entity.** An entity that still has any
  **active** navigation relationship on it (as either endpoint) cannot be
  withdrawn: the attempt is rejected `entity_withdrawal_blocked`. To retire a
  material, **withdraw its `topic_uses_material` link(s) first, then withdraw the
  material entity**; reactivate in reverse (entity first, then its link). Honor
  the other `rejected` reasons — `accepted_entity_not_found` (wrong id) and
  `validation_failed` (`status` must be exactly `active` or `withdrawn`) — instead
  of retrying unchanged.

Withdrawal and reactivation are **disposing actions, and disposing is the
curator's, not yours** — the same human-owned gate as acceptance and rejection.
Never withdraw or reactivate on your own initiative. When you spot retirable
content (a duplicate, an empty material, a stale link), **present the targets as a
numbered list** — each line carrying the title, the entity/relationship id, and
why you'd retire it — and act only on the curator's explicit numbered selection,
just as with acceptance. Read back the resulting state from the live API
afterward; do not report a retirement you have not confirmed.

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
