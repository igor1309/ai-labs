---
date: 2026-06-07
model: gpt-5.5
description: "Post-merge live verification and formal skill review for the BYOA curator skill bucket from PR #523."
---

# BYOA Curator Skills Post-Merge Follow-Up

## Scope

PR #523 merged with G5 live-instance verification unrun, G7 skill review only
informal, and the root suite red for unrelated projects. This follow-up verifies
the touched Agonara surface directly and records the defects found.

## Verification Results

- **Agonara suite:** pass after installing the lockfile-pinned workspace
  dependency with `npm ci --workspace agonara`.
- **Command:** `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`.
- **Result:** `[agonara tests] ok`.
- **Root suite:** pass after installing the complete root lockfile with
  `npm ci`.
- **Command:** `./scripts/run_silent.sh "tests" npm test`.
- **Result:** `[tests] ok`.
- **TypeScript build:** pass with
  `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- **Live instance:** pass against the production `npm start --workspace agonara`
  entrypoint on Node `v22.21.1`, backed by a fresh SQLite database.

The first attempts in this fresh worktree failed because only the Agonara
workspace dependency was installed: root tests could not resolve packages such
as `express` and `@modelcontextprotocol/sdk`, and `npx tsc` could not resolve the
repo compiler. After `npm ci`, both root gates passed. The previously reported
30 failures therefore do not reproduce on the merged revision with its
lockfile-installed dependency state.

## Live-Instance Transcript

The harness loaded the shared API-access behavior plus each curator skill,
bootstrapped a curator session, and used only HTTP operations.

| Skill | Job step | HTTP | Result |
|---|---|---:|---|
| `agonara-curator-corpus` | Create program | 200 | accepted |
| `agonara-curator-corpus` | Submit `candidateKind: material` to corpus candidates, as originally documented | 400 | `validation_failed` |
| `agonara-curator-corpus` | Accept topic corpus candidate | 200 | accepted as `topic` |
| `agonara-curator-corpus` | Accept material navigation candidate | 200 | accepted as `material_reference` |
| `agonara-curator-corpus` | Read accepted corpus | 200 | topic and material reference present |
| `agonara-curator-assessment` | Accept assessment criterion | 200 | accepted |
| `agonara-curator-assessment` | Accept open-answer check | 200 | accepted |
| `agonara-curator-assessment` | Accept quick check | 200 | accepted with protected answer key |
| `agonara-curator-research` | Record source | 200 | accepted |
| `agonara-curator-research` | Read coverage-gap diagnostics | 200 | report returned program/check coverage gaps |
| `agonara-curator-research` | Generate deterministic suggestion | 200 | draft `navigation_candidate` suggestion |
| `agonara-curator-research` | Read suggestion provenance | 200 | supporting evidence present |
| `agonara-curator-research` | Accept suggestion | 200 | suggestion `materialized` as a draft candidate |
| `agonara-curator-research` | Re-read accepted corpus and drafts | 200 | generated title absent from accepted corpus and present in drafts |
| `agonara-curator-participation` | Set invitation-only admission | 200 | accepted |
| `agonara-curator-participation` | Invite and accept student | 200 | active participant listed |
| `agonara-curator-participation` | Inspect participant response | 200 | no attempt, progress, weak-area, or feedback fields |
| `agonara-curator-participation` | Revoke second pending invitation | 200 | revoked |
| `agonara-curator-participation` | Remove active student | 200 | membership `removed` |
| `agonara-curator-participation` | Read membership events | 200 | complete invitation/join/revoke/remove history |

All live assertions passed. The failed material request is retained as evidence
of the shipped guidance defect; the corrected material-reference flow passed.

## Findings And Fixes

### Material Routing

- **Verdict:** fail.
- **Location:** `agonara/skills/agonara-curator-corpus/SKILL.md`.
- **Why:** The skill described materials as `/corpus-candidates` input, while
  that command accepts only `topic` and `concept`. The live request failed with
  `validation_failed`.
- **Fix:** Route materials through `/navigation-candidates` with
  `candidateKind: material_reference` and document its required fields.
- **Tests:** Covered by the live transcript and the existing Agonara suite.

### Invitation Contract

- **Verdict:** fail.
- **Location:** `agonara/skills/agonara-curator-participation/SKILL.md`;
  `agonara/docs/api/openapi.yml`.
- **Why:** Both artifacts documented `{ targetIdentityId, note? }`. The HTTP
  adapter requires exactly `{ participationKind: "student", targetIdentityId }`
  and rejects `note`.
- **Fix:** Align the skill and OpenAPI request body with the implemented route.
- **Tests:** Existing membership HTTP/acceptance tests exercise the implemented
  body; the corrected body also passed the live transcript.

### Opaque Request Shapes

- **Verdict:** warning.
- **Location:** curator corpus, assessment, and research skills.
- **Why:** Several OpenAPI request bodies are currently permissive
  `additionalProperties: true`, so route names alone do not let a fresh agent
  construct valid navigation, check, readiness, learner-state-link, or
  LLM-generation requests.
- **Fix:** Add the runtime-validated request shapes and enums to the relevant
  skill sections.
- **Tests:** The live transcript exercises corpus, criterion, open-answer,
  quick-check, participant privacy, and LLM generation/materialization behavior.

## Formal Skill Review

The following is the post-fix G7 review using the `skill-review` axes.

### `agonara-curator-corpus`

**Verdict:** Keep as-is.

- **[signal] Introduction and dependencies:** Establishes the corpus job and
  delegates auth/membership mechanics to foundations.
- **[signal] The draft/accepted model:** Encodes the explicit human acceptance
  invariant and prevents a high-impact operator error.
- **[signal] Create and read a program:** Gives the minimal shell workflow and
  response location.
- **[signal] Topics and concepts:** Names the exact supported candidate kinds
  and mutation lifecycle.
- **[signal] Read accepted corpus:** Preserves revision and audit-trail
  operations.
- **[signal] Navigation:** Encodes the non-obvious material-reference and
  relationship request shapes plus integrity rejections.
- **[signal] Boundaries:** Keeps Student Workspace state outside curator
  capability and routes adjacent jobs to their owning skills.

### `agonara-curator-assessment`

**Verdict:** Keep as-is.

- **[signal] Introduction and dependencies:** Correctly composes API access and
  accepted corpus prerequisites.
- **[signal] Governing boundary:** Distinguishes protected curation views from
  student-safe delivery and blocks answer-key leakage.
- **[signal] Open-answer checks:** Supplies the criterion-linked request shape
  and lifecycle.
- **[signal] Quick checks:** Supplies the option and zero-based answer-key
  contract plus protected/student-safe reads.
- **[signal] Readiness checks:** Supplies the topic/period scope and requirement
  shapes that OpenAPI does not constrain.
- **[signal] Assessment criteria:** Supplies the program-owned criterion shape
  and revision lifecycle.
- **[signal] Learner-state target links:** Names both owner and target enums
  without crossing into private Student reads.
- **[signal] Boundaries:** Keeps attempts, progress, and corpus composition in
  their owning skills.

### `agonara-curator-research`

**Verdict:** Keep as-is.

- **[signal] Introduction and dependencies:** States that research produces
  reviewable inputs rather than accepted curriculum.
- **[signal] External sources:** Gives the source request shape and grounding
  relationship.
- **[signal] Coverage gaps:** Correctly frames diagnostics as guidance.
- **[signal] LLM-assisted suggestions:** Supplies the generation request,
  provenance read, terminal actions, provider failures, and the two-gate
  materialization boundary.
- **[signal] Boundaries:** Prevents auto-acceptance and Student-state access.

### `agonara-curator-participation`

**Verdict:** Keep as-is.

- **[signal] Introduction and dependencies:** Adds only curator-side operations
  over the shared membership model.
- **[signal] Admission policy:** Gives the complete enum and request.
- **[signal] Invitations:** Gives the exact runtime request and separates
  curator invitation from student acceptance.
- **[signal] Participants:** Preserves the membership-only projection and
  historical-evidence invariant.
- **[signal] Stop curating:** Records the last-curator guard and content
  non-mutation boundary.
- **[signal] Membership history:** Keeps the audit read discoverable.
- **[signal] Boundaries:** Prevents role bleed into Student learning state and
  Admin recovery.

## Closeout

G5 and G7 are now supported by dated evidence. The merged PR was incomplete at
merge time; this follow-up does not rewrite that history. It records the gap,
fixes the defects exposed by the missing gates, and provides the evidence the
original plan required.
