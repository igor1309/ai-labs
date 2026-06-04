---
date: 2026-06-03
model: claude-opus-4-8
description: "ADR-010 -> spec traceability review for the Corpus Storage + Curator Workspace module (agonara)."
skill: traceability-review
skill_version: "0.7.0"
scope: "ADR -> spec, per module: Corpus Storage + Curator Workspace, project agonara"
mechanism: per-decision matrix
inputs:
  - file: adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md
    status: accepted
  - file: specs/corpus-storage-and-curator-acceptance-api.md
    version: 0.0.1
    status: draft
  - file: specs/corpus-storage-and-curator-acceptance-first-slice.md
    version: 0.0.1
    status: draft
---

# ADR-010 -> Spec Traceability Review: Corpus Storage + Curator Acceptance

## Summary

Enumerated **34 ADR-010 decisions/rules/invariants** (10 from the Decision
section, 24 from Rules / Invariants). Verdict breakdown:

- honoured: 31
- contradicted: 0
- missing: 0
- deferred: 3

Findings: **0** (0 fail, 0 warning).

Verdict: the two specs (first-slice domain contract + HTTP API) faithfully
carry every ADR-010 decision that is in scope for a first slice; the three
not-carried items are each covered by an ADR Non-Goal or the ADR's own
"first slice" scoping (Admin recovery flow, accepted checks/criteria, and the
later-ADR extension clause), so none is a finding.

Throughout, `first-slice` = `corpus-storage-and-curator-acceptance-first-slice.md`
and `api` = `corpus-storage-and-curator-acceptance-api.md`.

## Enumeration (per-decision matrix)

### Decision section (adr-010 lines 46-62)

| # | ADR decision (`adr-010:line`) | Verdict | Evidence |
|---|---|---|---|
| D1 | Model accepted Program corpus as a Corpus Storage responsibility separate from Curator Workspace (`adr-010:46`) | honoured | first-slice:14 (Goal: corpus "owned by Corpus Storage and Curator Workspace"); first-slice:66-85 (`AcceptedCorpusEntity`/`AcceptedCorpusRevision` distinct from `CorpusCandidate` :52-64); first-slice:18-20,42 (drafts vs accepted separated) |
| D2 | Corpus Storage owns accepted corpus records: topics, concepts, definitions, principles, material refs, source metadata, accepted assessment items, accepted criteria (`adr-010:48`) | honoured (shape deferred to first slice; existence carried) | first-slice:39,66-85 (`AcceptedCorpusKind = "topic" \| "concept"`; accepted entities/revisions own topic/concept + source records :41-50); narrowing to topic/concept/source for this slice is deferred by adr-010:102 and Non-Goals :109,112 |
| D3 | Preserve stable identifiers for accepted entities and stable accepted revisions for student-affecting changes (`adr-010:50`) | honoured | first-slice:103 (opaque stable identifiers); first-slice:66-85 (entity + revision model); first-slice:289 (revisions immutable); first-slice:306,50,312 (historical revisions remain addressable) |
| D4 | Curator Workspace owns research intake, candidate topics/concepts/materials/checks, draft criteria, LLM suggestions, gap analysis, review state before acceptance (`adr-010:52`) | honoured (candidate topic/concept carried; other candidate kinds deferred) | first-slice:52-64 (`CorpusCandidate`), :35 (`CandidateKind = "topic" \| "concept"`), :37 (`status` incl. `draft`); first-slice:333 (LLM output representable only as candidate); broader candidate kinds (materials/checks/criteria) deferred by adr-010:102 and Non-Goal :109 |
| D5 | Candidate/draft/LLM suggestions MUST NOT be visible as accepted corpus until explicit acceptance by an effective Program Curator (`adr-010:54`) | honoured | first-slice:18-20,42,53,275-276,298,309; api:19,50,277,308,331 |
| D6 | Acceptance is the boundary crossing; decision attributable to acting Identity, scoped to Program, authorized through effective Program Curator participation, connected to candidate/source/rationale (`adr-010:56`) | honoured | first-slice:127-131 (`acceptCorpusCandidate`), :175,280,24 (effective Program Curator auth), :288,32 (preserve candidate id, source ids, rationale, accepting Identity id, Program id); api:204,286-295 |
| D7 | Student Workspace MUST read accepted corpus through Corpus Storage and record learner state separately (`adr-010:58`) | honoured | first-slice:177,158-167 (read queries require effective Student/Curator/Admin), :291,35 (accepting does not create Student Workspace state); api:206-207,304,310,48 |
| D8 | Student Workspace MUST NOT mutate accepted corpus, own accepted revisions, or turn learner state into accepted content (`adr-010:60`) | honoured | first-slice:158-177 (Student access is read-only queries only; no Student mutation command exists), :291,35 (acceptance does not create Student state); api:206-207 (Student session only on GET accepted-corpus routes) |
| D9 | Admin authority is operational recovery only; MUST NOT by itself accept corpus or replace curator responsibility (`adr-010:62`) | honoured | first-slice:175,177 (Admin gets read access only; acceptance requires effective Program Curator, not Admin), :292,36 (accepting does not grant Admin authority); api:204,206-207 (acceptance route requires `admin_or_curator_required` curator auth; Admin appears only on read routes) |
| D10 | This ADR decides boundary + minimum acceptance invariants only; not schema, UI, API routes, ingestion, LLM prompts, scoring, DB layout (`adr-010:22`) | honoured (scoping statement, mirrored) | first-slice:321,65 and api:16,323,426 explicitly exclude the same downstream concerns; this is a scope statement the specs honour by staying within it |

### Rules / Invariants (adr-010 lines 66-88)

| # | ADR rule (`adr-010:line`) | Verdict | Evidence |
|---|---|---|---|
| R1 | Corpus Storage owns accepted Program corpus (`adr-010:66`) | honoured | first-slice:14,66-85 (accepted entity/revision model owned by this module) |
| R2 | Curator Workspace owns candidate and draft curation state before acceptance (`adr-010:67`) | honoured | first-slice:52-64,275; api:331 |
| R3 | Student Workspace owns learner state and MUST NOT own accepted corpus (`adr-010:68`) | honoured | first-slice:291,35 (no Student-owned accepted corpus; Student state out of scope :321); api:323,426 (Student Workspace state excluded) |
| R4 | Program Membership owns Program Curator participation and effective checks used to authorize acceptance (`adr-010:69`) | honoured | first-slice:16 (uses ADR-009/ADR-007 effective participation contract), :175,280,24; api:432 (delegate to Program Membership, do not duplicate) |
| R5 | Identity & Role Mgmt owns identities/credentials/Admin; MUST NOT own accepted corpus or acceptance decisions (`adr-010:70`) | honoured | first-slice:257 (acting internal Identity is an input, not owned here); api:16,431-432 (reuses Identity session contract, delegates, does not own); acceptance command lives in Corpus module first-slice:127-131 not Identity |
| R6 | Accepted corpus MUST be scoped to a stable Program shell (`adr-010:71`) | honoured | first-slice:66-85 (`programId` on accepted entity + revision), :16 (Program scope per ADR-009); api:206-207,266 |
| R7 | Candidate material MUST be scoped to the Program it may affect before acceptance (`adr-010:72`) | honoured | first-slice:52-64 (`programId` on `CorpusCandidate`), :16,272,283-284 (cross-Program sources rejected); api:283 |
| R8 | LLM output MUST remain candidate material until accepted by an effective Program Curator (`adr-010:73`) | honoured | first-slice:333 ("LLM output can be represented only as candidate material in this slice"), :334 (acceptance/rejection explicit curator actions); api candidate routes carry same |
| R9 | External source extraction MUST create candidate material or source metadata before accepted corpus (`adr-010:74`) | honoured | first-slice:11 (program_source_recorded before acceptance), :41-50 (`ProgramSource`), :108-115 (`recordProgramSource`), :74,318-320 (revision must point to accepted candidate, not raw source) |
| R10 | Accepted topics, concepts, definitions, principles, material refs, source metadata, accepted assessment items, accepted criteria MUST live in Corpus Storage (`adr-010:75`) | honoured (existence carried; topic/concept + source realized this slice, remainder deferred) | first-slice:39,41-85 (topic/concept accepted kinds + source records in Corpus Storage); checks/criteria/materials deferred by adr-010 Non-Goal :109 and first-slice:321,65 |
| R11 | Research notes, extracted candidates, draft suggestions, LLM suggestions, proposed criteria, coverage gaps, review state MUST live outside accepted corpus until acceptance (`adr-010:76`) | honoured | first-slice:18-20,42,275-276,309,53 (drafts/rejected never in accepted corpus); api:277,308,331 |
| R12 | Acceptance MUST be an explicit action (`adr-010:77`) | honoured | first-slice:127-131 (`acceptCorpusCandidate` command), :334 (explicit curator action); api:204,286 |
| R13 | Acceptance MUST be authorized through effective Program Curator participation for the Program (`adr-010:78`) | honoured | first-slice:175,280,24; api:204,287,29 |
| R14 | Acceptance MUST be attributable to the acting internal Identity (`adr-010:79`) | honoured | first-slice:32,288 (`acceptedByIdentityId` preserved), :127 (`actingIdentityId` input); api:295,37 |
| R15 | Acceptance MUST preserve provenance to source/candidate/draft/LLM suggestion/curator rationale that justified the change (`adr-010:80`) | honoured | first-slice:32,288 (preserves candidate id, source ids, rationale); api:295,37; first-slice:335 (CUR-13 provenance) |
| R16 | Acceptance MUST create/update accepted corpus through a stable accepted revision, not silently overwrite history (`adr-010:81`) | honoured | first-slice:30,31,287 (new current revision on update), :289 (revisions immutable), :306,50 (prior revision stays addressable); api:294,378 |
| R17 | Accepted revisions referenced by student attempts/feedback/progress MUST remain addressable (`adr-010:82`) | honoured | first-slice:50,306,164-167 (`getAcceptedCorpusRevision` returns historical revisions); api:207,312,408 |
| R18 | Student attempts/answers/feedback/evidence/mastery/weak areas/history MUST reference accepted corpus, not copy ownership (`adr-010:83`) | honoured (reference side carried; learner-state shape deferred) | first-slice:291,35 (accepting does not create Student state), :321 (student attempts/progress out of slice scope); read queries first-slice:158-177 expose accepted corpus by reference; learner state owned elsewhere, deferred by adr-010 Non-Goal :110 |
| R19 | Updating accepted corpus MUST NOT erase or rewrite existing student learning history (`adr-010:84`) | honoured | first-slice:289 (revisions immutable), :30,31 (update adds new revision, prior remains), :306,50 (historical revisions addressable); api:378 |
| R20 | Draft rejection MUST NOT delete accepted corpus (`adr-010:85`) | honoured | first-slice:43,299 ("Rejecting a candidate does not delete accepted corpus"); api:302 |
| R21 | Candidate deletion/cleanup MUST NOT remove accepted revisions or student references (`adr-010:86`) | honoured | first-slice:37,293 (accepting does not delete records), :44,300; revisions immutable :289; no candidate-deletion command exists in this slice (cleanup out of scope) |
| R22 | Acceptance MUST create or update through a stable accepted revision (covered as R16) / accepted entity exposes current revision (`adr-010:81`,:34) | honoured | first-slice:34,290 (entity exposes current accepted revision); api:294 |
| R23 | Admin recovery MAY repair broken corpus/acceptance records in a later ADR-defined exceptional flow, preserving attribution, not the ordinary path (`adr-010:87`) | deferred | adr-010:87 explicitly defers the recovery flow to "a later ADR-defined exceptional flow"; first-slice:319-320 carries restore-integrity guards (no Admin repair command) — existence of the recovery flow is ADR-deferred, not in this slice |
| R24 | Later ADRs MAY define concrete schemas, permissions, ingestion, material storage, LLM workflows, acceptance APIs, UI, migration only if they preserve the ownership boundary (`adr-010:88`) | deferred | adr-010:88 is a forward-looking permission for later ADRs; the specs preserve the boundary (D1-D9) and exclude these concerns first-slice:321,65 / api:16,323,426 — nothing in this slice to carry |

### Non-Goals (adr-010 lines 106-121) — deferral authority, not enumerated as rows

The Non-Goals (DB layout, exact accepted schema, assessment module placement,
ingestion tooling, reliability scoring, material storage, LLM prompt design,
Curator/Student UI, API route names, plan phases, licensing, collaborative
editing/branching/merge, org/tenant governance) are deferral authority. The
specs honour them by exclusion: first-slice:321,65 and api:16,323,426. One
deferred-shape item below relies on them:

| # | Item the spec narrows | Verdict | Deferring ADR line |
|---|---|---|---|
| N1 | Accepted checks and accepted assessment criteria not realized this slice (D2/R10 list them) | deferred | adr-010:109 (Non-Goal: "exact accepted corpus schema for topics, concepts, materials, checks, or criteria"); :111 (assessment module placement); first-slice:65,321 / api:323,426 exclude accepted checks/criteria explicitly |

## Findings

None. Every row is `honoured` or `deferred`; no `contradicted` (fail) and no
`missing` (warning) rows.

## Open questions

None requiring escalation. Two observations, neither a finding:

1. (resolving layer: ADR / future spec) The ADR lists definitions, principles,
   material references, accepted assessment items, and accepted criteria as
   accepted-corpus content Corpus Storage owns (adr-010:48,75). The first slice
   realizes only `topic` and `concept` accepted kinds (first-slice:39). This is
   covered by the ADR's "narrow first implementation" allowance (adr-010:102)
   and Non-Goal :109, so it is `deferred`, not `missing` — but a later spec
   slice must extend `AcceptedCorpusKind` to honour D2/R10 in full.

2. (resolving layer: ADR) Admin recovery (R23, adr-010:87) is deferred to a
   later ADR. The first slice's restore guards (first-slice:319-320) enforce
   accepted-corpus integrity without an Admin repair path, consistent with
   "MUST NOT become the ordinary acceptance path" — the eventual recovery ADR
   should confirm those guards remain compatible.

## Inspected

- `adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md` (status:
  accepted) — Decision section (lines 46-62) and Rules / Invariants (lines
  66-88) enumerated as 34 rows; Non-Goals (lines 106-121) used as deferral
  authority.
- `specs/corpus-storage-and-curator-acceptance-first-slice.md` (version 0.0.1,
  status: draft) — domain contract, behavior rules 1-65, intent traceability,
  done criteria.
- `specs/corpus-storage-and-curator-acceptance-api.md` (version 0.0.1, status:
  draft) — HTTP API, behavior rules 1-66, intent traceability, done criteria.

IDs enumerated: D1-D10 (Decision), R1-R24 (Rules / Invariants), N1 (Non-Goal
deferral). Decision/Rule pinning follows the ADR's own paragraph and bullet
boundaries; R22 pairs the entity-exposes-current-revision bullet (adr-010:34 in
Decision wording / R16's invariant) without sub-splitting the stable-revision
rule.
