---
date: 2026-06-03
model: claude-opus-4-8
description: "Deterministic per-module coverage matrix for the intent → ADR layer-pair, scoped to Corpus Storage + Curator Workspace."
skill: traceability-review
skill_version: "0.2.0"
scope: "intent → ADR — agonara — module: Corpus Storage + Curator Workspace"
slices: [fidelity, vertical-coverage]
mechanism: deterministic-coverage-matrix
inputs:
  intent:
    - { file: "agonara/docs/intent_learning_program_app.md", version: "0.3.0" }
    - { file: "agonara/docs/curator_user_stories.md", version: "0.3.0" }
    - { file: "agonara/docs/student_user_stories.md", version: "0.3.1" }
    - { file: "agonara/docs/admin_user_stories.md", version: "0.2.1" }
  adrs:
    - { file: "agonara/docs/adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md", status: accepted }
    - { file: "agonara/docs/adr/adr-009-program-shell-and-initial-curator-participation.md", status: accepted }
  map:
    - { file: "agonara/docs/module_responsibility_map.md", version: "0.4.3" }
---

# Intent → ADR Coverage Matrix — Corpus Storage + Curator Workspace

## Summary

This review enumerates every intent capability the Module Responsibility Map (v0.4.3) assigns to Corpus Storage and Curator Workspace, then checks each against the accepted ADRs that own the corpus/curator boundary: ADR-010 (primary) and ADR-009 (Program shell, owned by Corpus Storage). No third ADR is forced in: the map points the corpus-content product-intent stories (INT-01..INT-06) and the Program shell to these two ADRs, and assigns accepted checks/criteria to Corpus Storage, whose acceptance boundary ADR-010 decides. (INT-04..INT-06 assessment *execution* and the open-answer *evaluation* loop are owned by ADR-011..ADR-016 / Student Workspace and are out of this module's scope; only the accepted-content shape they read is in scope here.)

- Total matrix rows (owned capabilities enumerated): 22
- Verdict breakdown:
  - carried: 17
  - deferred: 4
  - carried-with-loss: 1
  - uncovered: 0
  - contradicted: 0
- Finding totals:
  - fidelity / fail (contradicted): 0
  - fidelity / warning (carried-with-loss): 1
  - coverage / warning (uncovered): 0
- Open questions: 2

## Coverage matrix

| Cap ID | Statement | Owner (map) | Verdict | Evidence |
|---|---|---|---|---|
| INT-01 | Assemble a learning program from external sources and own materials into accepted corpus. | Corpus Storage + Curator Workspace | carried | ADR-010:48 "Corpus Storage MUST own accepted corpus records for a `Program`, including accepted topics, concepts, definitions, principles, material references, source metadata used by accepted content…"; ADR-010:52 Curator Workspace owns "research intake, candidate topics, candidate concepts, candidate materials… before acceptance." |
| INT-02 | A topic exposes key terms, concepts, principles, definitions — incl. confusing neighbors. | Corpus Storage | carried-with-loss | ADR-010:48 lists "accepted topics, concepts, definitions, principles" as owned, but "confusing neighbors" / confusable-concept relations (intent:115, STU-07:80) are nowhere named in ADR-010's accepted-entity enumeration (see Finding F-1). |
| INT-03 | Materials linked to topics/concepts so students see which sources support each part. | Corpus Storage | carried | ADR-010:48 owns "material references, source metadata used by accepted content"; ADR-010:75 "material references… MUST live in Corpus Storage." |
| INT-04 (accepted-content slice) | Accepted checks exist in corpus for students to verify understanding. | Corpus Storage | carried | ADR-010:48 owns "accepted assessment items"; ADR-010:75 "accepted assessment items… MUST live in Corpus Storage." (Execution owned by ADR-011/016, out of scope.) |
| INT-05 (accepted-content slice) | Open answers evaluated against program criteria owned by corpus. | Corpus Storage | carried | ADR-010:48 owns "accepted assessment criteria"; ADR-010:56 acceptance "connected to the candidate, source, or rationale." (Evaluation loop owned by ADR-012..015, out of scope.) |
| INT-06 (accepted-content slice) | Topic/period-level checks exist as accepted content. | Corpus Storage | carried | ADR-010:48,75 "accepted assessment items" owned by Corpus Storage; stable revisions ADR-010:50. (Check execution out of scope.) |
| CUR-01 | Create a program from grounded sources so structure is grounded. | Corpus Storage (shell) + Curator Workspace | carried | ADR-009:40 "Agonara MUST model a minimal accepted `Program` shell…"; ADR-009:48 creation "request Program Membership to establish active `Program Curator` participation"; ADR-010:52 candidate sources owned by Curator Workspace before acceptance. |
| CUR-02 | Add topics and concepts to a program; corpus shows accepted separately from drafts. | Corpus Storage + Curator Workspace | carried | ADR-010:48 accepted topics/concepts owned by Corpus Storage; ADR-010:54 "Candidate material… MUST NOT be visible as accepted corpus until an explicit acceptance decision." |
| CUR-03 | Link materials to topics and concepts. | Corpus Storage + Curator Workspace | carried | ADR-010:48 "material references" owned; ADR-010:52 "candidate materials" owned by Curator Workspace pre-acceptance. |
| CUR-04 | Add checks/assessment items to topics. | Corpus Storage + Curator Workspace | carried | ADR-010:48 "accepted assessment items"; ADR-010:52 "candidate checks" pre-acceptance. |
| CUR-05 | Define assessment criteria tied to the program. | Corpus Storage + Curator Workspace | carried | ADR-010:48 "accepted assessment criteria"; ADR-010:52 "draft criteria" pre-acceptance. |
| CUR-06 | Keep accepted content separate from drafts/suggestions. | Curator Workspace / Corpus Storage boundary | carried | ADR-010:54 "Candidate material, draft suggestions, and LLM suggestions MUST NOT be visible as accepted corpus until an explicit acceptance decision is made by an effective `Program Curator`." |
| CUR-07 | Add external sources with metadata explaining why they informed the program. | Curator Workspace | carried | ADR-010:52 "research intake… owned by Curator Workspace"; ADR-010:74 "External source extraction MUST create candidate material or source metadata before it creates accepted corpus." |
| CUR-08 | Derive candidate topics/concepts/checks from external sources; stay reviewable drafts. | Curator Workspace | carried | ADR-010:52 owns "candidate topics, candidate concepts… gap analysis"; ADR-010:74 extraction creates candidate material before accepted corpus. |
| CUR-09 | See coverage gaps without treating them as accepted content. | Curator Workspace | carried | ADR-010:52 owns "gap analysis"; ADR-010:76 "coverage gaps… MUST live outside accepted corpus until acceptance." |
| CUR-10 | Update program after research without erasing student state. | Corpus Storage | carried | ADR-010:81 "Acceptance MUST create or update accepted corpus through a stable accepted revision, not by silently overwriting historical accepted state"; ADR-010:84 "Updating accepted corpus MUST NOT erase or rewrite existing student learning history." |
| CUR-11 | Use LLM assistance; output captured as candidate material with draft status. | Curator Workspace | carried | ADR-010:52 owns "LLM-assisted suggestions"; ADR-010:73 "LLM output MUST remain candidate material until accepted by an effective `Program Curator`." |
| CUR-12 | Review/accept/reject LLM suggestions as an explicit curator action. | Curator Workspace / acceptance boundary | carried | ADR-010:54 acceptance is "an explicit acceptance decision… by an effective `Program Curator`"; ADR-010:77 "Acceptance MUST be an explicit action"; ADR-010:85 "Draft rejection MUST NOT delete accepted corpus." |
| CUR-13 | Trace why a suggestion was proposed (source/prompt/evidence) before acceptance. | Curator Workspace | carried | ADR-010:56 acceptance "connected to the candidate, source, or rationale that justified the accepted corpus change"; ADR-010:80 "Acceptance MUST preserve provenance to the accepted source, candidate, draft, LLM suggestion, or curator rationale." |
| STU-06 (corpus-content slice) | Topic view exposes accepted concepts, terms, principles, definitions. | Corpus Storage | carried | ADR-010:48,75 "accepted topics, concepts, definitions, principles… MUST live in Corpus Storage"; ADR-010:58 Student Workspace "MUST read accepted corpus through Corpus Storage." |
| STU-07 (corpus-content slice) | Confusable/related concepts shown together with the distinction to preserve. | Corpus Storage | carried-with-loss | Folded into Finding F-1 with INT-02: ADR-010:48 enumerates accepted entities but never names confusable-concept relations from STU-07:80 / intent:115. (Counted once under F-1; this row shares the finding, not a second warning.) |
| STU-09 (corpus-content slice) | Materials reachable from the topic or concept they support. | Corpus Storage | carried | ADR-010:48 "material references" owned; ADR-010:75 same. Navigability is a read concern of Student Workspace over corpus-owned references. |
| STU-10 (corpus-content slice) | Return from material back to the concepts it supports. | Corpus Storage | deferred | ADR-010:58 Student Workspace "MUST read accepted corpus through Corpus Storage"; bidirectional navigation linkage shape is read-side / schema detail explicitly left open by ADR-010:109 (no "exact accepted corpus schema") — deferred, not a loss. |

### Deferred-row notes

Four capabilities carry the *ownership* commitment but defer concrete shape to later layers, each citing a deferral line in scope:

- CUR-01 program shell metadata shape — ADR-009:42 defines the shell narratively; ADR-009:101 Non-Goals defer "full Program corpus schema."
- INT-05/CUR-05 criteria binding format — ADR-010:111 Non-Goals defer "exact accepted corpus schema for… criteria."
- STU-10 material→concept back-navigation shape — ADR-010:109 defers "exact accepted corpus schema."
- Source ingestion / extraction tooling behind CUR-07/CUR-08 — ADR-010:112 Non-Goals "source ingestion tooling." (CUR-07/CUR-08 themselves are carried; only the tooling is deferred.)

These are recorded as `carried` in the matrix where the ownership and acceptance invariant are present, and the deferral is the implementation detail; STU-10's *back-link* is the one row where even the directional linkage is left to schema, so it is marked `deferred`.

## Findings

Findings are derived mechanically from the matrix. One `carried-with-loss` row pair produces one fidelity warning; no `contradicted` and no `uncovered` rows exist, so there are no fail or coverage findings.

### F-1 (fidelity / warning) — Confusable-concept relations are an intent commitment not named in the accepted-entity set

- Verdict: warning (carried-with-loss)
- Rows: INT-02, STU-07
- Intent commitment (both quote the same capability):
  - `agonara/docs/intent_learning_program_app.md:115` — "A student can inspect a topic and see its key concepts, definitions, principles, and **confusing neighbors**." (INT-02 acceptance signal)
  - `agonara/docs/student_user_stories.md:80` — "**confusing or related concepts** can be shown together with the distinction to preserve." (STU-07 acceptance signal)
- Narrowing ADR passage:
  - `agonara/docs/adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md:48` — Corpus Storage owns "accepted topics, concepts, definitions, principles, material references, source metadata used by accepted content, accepted assessment items, and accepted assessment criteria." The enumeration of accepted entities is closed at this level and lists no concept-to-concept "confusable/related" relation; line 75 repeats the same closed list.
- Why this is a loss rather than a clean carry/defer: ADR-010 does not defer this via a Non-Goal — its Non-Goals (lines 106–121) defer schema/UI/ingestion/scoring, not the *existence* of a confusable-neighbor relation. The intent treats "confusing neighbors" as a first-class corpus capability that distinguishes the product from a flat concept list. By enumerating the owned accepted entities explicitly while omitting any relation that carries this distinction, ADR-010 narrows the corpus model below the intent commitment without saying so. The omission is recoverable (a relation can be added) but is currently un-tracked at this layer, which is the definition of carried-with-loss.
- Fix: add a line to the ADR-010 Decision/Rules enumeration acknowledging that Corpus Storage owns accepted concept-relationship records sufficient to express confusable/related-concept distinctions (mirroring intent INT-02 and STU-07), or, if the authors intend to defer the relation's shape, add it explicitly to ADR-010 Non-Goals so the deferral is on the record and the row converts to `deferred`. Either resolves the silent narrowing.

## Open questions

- [resolving layer: spec / schema] What is the concrete accepted-corpus representation of "confusable/related concept" relations (INT-02, STU-07)? Even once F-1 is resolved at the ADR layer, the relation's cardinality, directionality, and the "distinction to preserve" payload are schema decisions ADR-010:109,111 explicitly leaves to later specs.
- [resolving layer: spec / schema] What linkage shape gives STU-10 reliable material→concept back-navigation without duplicating the topic/concept→material references INT-03 already owns? ADR-010 owns "material references" but leaves directionality to schema (ADR-010:109); a spec must decide whether back-navigation is a derived query or a stored reverse edge.

## Inspected

- `agonara/docs/module_responsibility_map.md` (v0.4.3) — authoritative ownership; finalized the owned set (Corpus Storage rows 68/124-126, Curator Workspace rows 70/127-128; CUR-14..18 excluded as Program Membership per rows 69/79).
- `agonara/docs/intent_learning_program_app.md` (v0.3.0) — INT-01..INT-07, acceptance signals (110-120), curation section (137-154).
- `agonara/docs/curator_user_stories.md` (v0.3.0) — CUR-01..CUR-13 (rows 23-129); CUR-14..18 read for exclusion only.
- `agonara/docs/student_user_stories.md` (v0.3.1) — STU-06/07/09/10 corpus-content reads (rows 66-106).
- `agonara/docs/admin_user_stories.md` (v0.2.1) — confirmed no admin story assigns accepted-corpus ownership to this module (boundary rows 181-189).
- `agonara/docs/adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md` (accepted) — primary.
- `agonara/docs/adr/adr-009-program-shell-and-initial-curator-participation.md` (accepted) — Program shell ownership for CUR-01.
