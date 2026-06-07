---
date: 2026-06-07
model: claude
description: "Implementation plan: the Curator bucket of Agonara BYOA operator skills — corpus assembly, assessment authoring, research/LLM-assist, and curator participation — grounded in the OpenAPI contract."
---

# BYOA Operator Skills — Curator Bucket

Implements the **first role** of the build sequence in
[`byoa-operator-skills.md`](byoa-operator-skills.md). Curator has the most
distinct jobs (CUR-01…18) and is the role most likely to fan into a **bucket**
of several skills; building it first proves the bucket pattern. Grounded in
[`../api/openapi.yml`](../api/openapi.yml) and
[`../intent/curator_user_stories.md`](../intent/curator_user_stories.md).

**Depends on `byoa-skills-foundations.md` (api-access + membership).** Curator
skills reference those foundations; they do not duplicate auth, CSRF,
idempotency, envelope, or the membership model.

## Goal

Deliver an `agonara/skills/agonara-curator-*` bucket so an agent operating as a
program curator can assemble and accept program content, author checks and
criteria, run research/LLM-assisted curation, and manage program participation —
all through the contract, honoring the curator/student boundary (drafts and
answer keys never leak to students; curators never read private student learning
state).

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout
```

## Execution lock

```
Worktree mode: create new
Expected worktree: worktrees/byoa-skills-curator
Expected branch: <author>/byoa-skills-curator
Preflight check: [ ] done
```

Preflight: confirm worktree/branch match before each phase.

## Scope guardrails

- **Curator jobs only.** No student learning/attempt flows, no admin
  identity/recovery flows. Other roles' jobs do not bleed into curator scope.
- **Lean on foundations; do not duplicate them.** Auth, CSRF, idempotency, the
  envelope, and the participation model come from `agonara-api-access` and
  `agonara-membership`. Reference, don't restate.
- **Contract is the substrate.** Every cited operation exists in
  `../api/openapi.yml`. No `src/`, tests, repo tooling, or runtime assumptions.
- **Ownership-safe.** Drafts/candidates, answer keys, correctness metadata,
  acceptance rationale, and provider internals are curator-only and must never
  be presented as student-visible. Curators do not read private student
  attempts, weak areas, progress, or feedback. Accepted-corpus changes must not
  overwrite student state (CUR-10).
- **Acceptance is explicit.** Candidates/suggestions are draft until an explicit
  curator acceptance action; the skill must never auto-accept generated content
  (CUR-06, CUR-12).
- **No discovery/publishing, no product repositioning.** Same exclusions as the
  foundations plan.

## Working bucket decomposition

Proposed four-skill bucket (the build may merge adjacent skills if real job
volume is thin — e.g. fold assessment into corpus — but must not split a single
job across skills):

| Skill | Stories | Contract surface (in `../api/openapi.yml`) |
|---|---|---|
| `agonara-curator-corpus` | CUR-01,02,03,06,08,10 | `/programs` (GET/POST), `/programs/{id}`, `/programs/{id}/corpus-candidates`, `/corpus-candidates/{id}/acceptance`,`/rejection`, `/programs/{id}/accepted-corpus`, `/accepted-corpus-revisions/{id}`, `/programs/{id}/corpus-events`, `/programs/{id}/navigation-candidates`, `/navigation-candidates/{id}/acceptance`,`/rejection`, `/programs/{id}/navigation`, `/navigation/entities/{id}`, `/navigation/revisions/{id}` |
| `agonara-curator-assessment` | CUR-04,05 | `/programs/{id}/open-answer-checks*`, `/programs/{id}/quick-checks*`, `/programs/{id}/readiness-checks/candidates` + acceptance/rejection/curation/revisions, `/programs/{id}/assessment-criteria*`, `/programs/{id}/learner-state-target-links`, `/learner-state-target-links/{id}` |
| `agonara-curator-research` | CUR-07,09,11,12,13 | `/programs/{id}/sources`, `/programs/{id}/coverage-gaps`, `/programs/{id}/llm-curation-suggestions`, `/llm-curation-suggestions/{id}` + acceptance/rejection |
| `agonara-curator-participation` | CUR-14,15,16,17,18 | `/programs/{id}/invitations` (GET/POST), `/program-invitations/{id}/revocation`, `/programs/{id}/participants`, `/programs/{id}/participants/student/{identityId}` (DELETE), `/programs/{id}/admission-policy` (PATCH), `/programs/{id}/curator-membership` (DELETE), `/programs/{id}/membership-events` |

Phase order = dependency order: corpus first (the substrate the others attach
to), then assessment (checks/criteria reference corpus entities), then research
(produces candidates/suggestions that feed corpus/assessment acceptance), then
participation (independent; leans on shared membership).

## Validation gates (reused by every phase)

Same G1–G7 as `byoa-skills-foundations.md` (incl. **G7 skill review** — self +
adversarial), with role specifics:

- **G1 Contract-grounded** — every cited curator operation exists in
  `../api/openapi.yml`.
- **G2 Portable** — no `src/`/tests/tooling/runtime references.
- **G3 Role-scoped** — only curator operations + the two foundations; no student
  attempt/progress or admin identity operations.
- **G4 Ownership-safe** — the skill instructs honoring candidate/accepted
  separation, answer-key/correctness redaction toward students, and no reads of
  private student learning state; accepted-corpus edits preserve student state.
- **G5 Live-instance** — against a running instance with a curator session, the
  skill's job completes through the API (e.g. create program → add candidate →
  accept → read accepted corpus; author a check + criteria; record a source →
  read coverage gaps → review/accept an LLM suggestion; invite a student → list
  participants → revoke).
- **G6 Docs gates** — README/skills listing, `docs/log.md`, dashboard refresh.

## Phase 1 — `agonara-curator-corpus`

**Objective**: assemble and accept program structure — the substrate every other
curator job attaches to.

**Key work items**: SKILL.md (front-matter incl. `author: Igor Malyarov`)
teaching: create a program and attach grounding sources by reference; add topics
/concepts/materials as corpus candidates; keep drafts separate from accepted;
explicitly accept/reject candidates; read accepted corpus and revisions; manage
navigation candidates and accepted navigation (linking materials to topics
/concepts); read corpus-events. State the CUR-10 invariant: accepted changes do
not erase student state.

**Dependencies**: foundations plan landed.

**Risks**: presenting candidate content as accepted (G4); auto-accepting (CUR-06).

**Validation**: G1–G5 for the corpus job loop.

**Completion signal**: a curator agent builds a grounded program and controls
the accepted/draft boundary through the API.

**Commit** after gates pass.

## Phase 2 — `agonara-curator-assessment`

**Objective**: author checks (open-answer, quick, readiness) and assessment
criteria, and link checks to learner-state targets.

**Key work items**: SKILL.md teaching the candidate→acceptance→revision flow for
each check kind and for assessment criteria; how criteria are referenced by
checks/open-answer prompts (CUR-05); managing learner-state-target-links.
Emphasize answer keys/correctness are curator-only and never student-facing.

**Dependencies**: Phase 1 (checks attach to accepted corpus entities).

**Risks**: leaking answer keys/correctness toward students (G4); crossing into
student attempt flows (G3).

**Validation**: G1–G5 for authoring a check + criteria and accepting them.

**Completion signal**: a curator agent authors and accepts checks and criteria
tied to the program, with keys kept curator-only.

**Commit** after gates pass.

## Phase 3 — `agonara-curator-research`

**Objective**: ground the program in external sources and use coverage gaps +
LLM-assisted suggestions to expand it — as reviewable drafts.

**Key work items**: SKILL.md teaching: record external sources with justifying
metadata (CUR-07); read coverage gaps as draft guidance, not accepted facts
(CUR-09); request/list LLM curation suggestions, trace a suggestion's origin
before deciding (CUR-13), and explicitly accept/reject (CUR-11,12). Stress that
suggestions and gaps are draft material until accepted.

**Dependencies**: Phases 1–2 (suggestions/gaps reference corpus and assessment
state; acceptance routes candidates into them).

**Risks**: treating suggestions/gaps as accepted content (G4); auto-acceptance.

**Validation**: G1–G5 for the research/suggestion-review loop.

**Completion signal**: a curator agent runs research-driven expansion with
explicit human-owned acceptance.

**Commit** after gates pass.

## Phase 4 — `agonara-curator-participation`

**Objective**: manage who participates in a curator-controlled program.

**Key work items**: SKILL.md teaching: set admission policy; invite students and
revoke invitations; list pending/accepted invitations and current participants;
remove a student; stop curating (`curator-membership` DELETE); read
membership-events. Lean on `agonara-membership` for the shared model; this skill
adds only curator-side operations. Stress: participant visibility never exposes
private student learning state (CUR-16); removal preserves historical evidence
(CUR-17); stopping curation does not mutate accepted corpus (CUR-18).

**Dependencies**: foundations (membership) landed; independent of Phases 1–3.

**Risks**: duplicating the shared membership model (G3); exposing student
learning state through participant views (G4).

**Validation**: G1–G5 for the invite → list participants → revoke loop.

**Completion signal**: a curator agent controls participation without seeing
private student learning state.

**Commit** after gates pass.

## Phase 5 — Closeout

**Objective**: list the bucket and update docs.

**Key work items**: add the bucket skills to `agonara/skills/README.md` (and
`agonara/README.md` only if it enumerates surfaces/skills — not the repo-root
`## Components` table); `docs/log.md` entry; refresh
`docs/loc-dashboard.html` if substantial; move this plan to
`docs/plans/implemented/byoa-skills-curator.md` in the implementing PR.

**Dependencies**: Phases 1–4 green.

**Validation**: G6.

**Completion signal**: bucket discoverable, docs current, plan archived.

## Done criteria

- The `agonara-curator-*` bucket exists (the four working skills, or a
  justified merge), each contract-grounded, portable, role-scoped, and
  ownership-safe.
- CUR-01…18 are each reachable through an agent + a bucket skill; the boundary
  (drafts/keys curator-only; no private student state read; accepted changes
  preserve student state) holds in every skill.
- Each skill passes G1–G5 with a live-instance transcript.
- README/skills listing, `docs/log.md`, dashboard (if substantial) updated;
  plan archived.

## Final closeout

```
Final gates: G1–G7 across the bucket (contract spot-checks, portability scan, role-scope + ownership-safety review, skill review, live-instance transcripts per skill, docs/link checks, dashboard refresh-and-verify if substantial)
Archive plan: move to agonara/docs/plans/implemented/byoa-skills-curator.md
Commit archive move: yes
Push/PR: push at closeout; PR per repo conventions only if requested
```
