---
name: agonara-curator-assessment
author: Igor Malyarov
version: "1.1.0"
description: Operate as an Agonara program curator to author assessment — open-answer checks, quick checks, and readiness checks via the candidate→acceptance→revision flow, define program-owned assessment criteria, link checks to learner-state targets, and keep answer keys and correctness curator-only (never student-facing). Use when a curator agent is adding or accepting checks or criteria on a program. Builds on the corpus skill; checks attach to accepted corpus entities.
trigger: when a curator agent needs to author or accept a check (open-answer, quick, readiness), define assessment criteria, or manage learner-state target links
---

# Agonara curator — assessment

Author the ways a program verifies understanding: **checks** (open-answer, quick,
readiness), **assessment criteria** that evaluation is tied to, and the
**learner-state target links** that say which checks produce learner-state
evidence.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for auth, the
`X-Agonara-CSRF` header on mutations, and the envelope. Checks and criteria
attach to accepted corpus entities, so this skill builds on
[`agonara-curator-corpus`](../agonara-curator-corpus/SKILL.md) and reuses its
draft↔accepted (candidate→acceptance→revision) lifecycle — propose a candidate,
review it, then explicitly accept (never auto-accept).

## The boundary that governs everything here

Answer keys, correct options, correctness metadata, and grading rationale are
**curator-only**. The contract gives each check two faces:

- a **protected curation view** an accepted revision exposes to curators —
  `GET /quick-checks/revisions/{revisionId}/curation` and
  `GET /readiness-checks/revisions/{revisionId}/curation`; and
- a **student-safe delivery view** — `GET /programs/{programId}/quick-checks`
  and `GET /quick-checks/revisions/{revisionId}` — which is the redacted form a
  student receives.

Read keys through the `/curation` views only, and never present `/curation`
detail as something a student sees. Authoring keys is a curator job; reading
student attempts, results, or progress is **not** — those belong to the student,
and a curator does not read private student learning state.

## Open-answer checks

- **Propose** — `POST /programs/{programId}/open-answer-checks/candidates` with
  `{ "checkKind": "open_answer", "title", "prompt", "criterionEntityIds", "sourceIds"?, "rationale"? }`.
  `criterionEntityIds` must contain at least one accepted assessment-criterion
  entity id.
- **List candidates** — `GET /programs/{programId}/open-answer-checks/candidates`
  (filter by `status`).
- **Accept / reject** —
  `POST /open-answer-checks/candidates/{candidateId}/acceptance` (optionally
  `{ "targetEntityId" }` to revise an accepted check),
  `POST /open-answer-checks/candidates/{candidateId}/rejection`.
- **Read accepted** — `GET /programs/{programId}/open-answer-checks`;
  `GET /open-answer-checks/revisions/{revisionId}` for revision detail.

## Quick checks

- **Propose** — `POST /programs/{programId}/quick-checks/candidates` with
  `{ "checkKind": "single_select_quick_check", "title", "prompt", "options", "answerKeyOptionIndex", "sourceIds"?, "rationale"? }`.
  Provide at least two non-empty options; `answerKeyOptionIndex` is the
  zero-based index of the correct option.
- **List** — `GET /programs/{programId}/quick-checks/candidates` (filter by
  `status`).
- **Accept / reject** —
  `POST /quick-checks/candidates/{candidateId}/acceptance` (optionally
  `{ "targetEntityId" }` to revise an accepted quick check in place),
  `POST /quick-checks/candidates/{candidateId}/rejection`.
- **Read accepted** (curator list, includes keys) —
  `GET /programs/{programId}/quick-checks/curation` enumerates the program's
  accepted quick checks with each one's accepted-quick-check entity id, current
  revision id, and answer key. This is how you discover the entity id to revise
  an already-accepted check.
- **Curator curation detail** (keys/correct option) —
  `GET /quick-checks/revisions/{revisionId}/curation`.
- **Student-safe delivery** (redacted) —
  `GET /programs/{programId}/quick-checks`,
  `GET /quick-checks/revisions/{revisionId}`. Use this to confirm what a student
  would actually see.

### Distractor quality (the options carry the difficulty)

A single-select check is only as good as its wrong options. Satisfying the
contract — two non-empty options, one key index — does **not** make a usable
check. The default failure mode is distractors a learner can eliminate without
understanding the concept, which lets them score by reasoning about the *options*
instead of the *material*. Every distractor must earn its place:

- **Each wrong option encodes a real, nameable mistake.** A distractor should be
  what a learner believes if they hold a specific misconception, did a partial or
  half-remembered version of the reasoning, or confused two related ideas from the
  accepted corpus. If you cannot state *which* error or confusion an option
  represents, it is filler — replace it.
- **No throwaways, jokes, or off-topic options.** Reject options that are absurd,
  unrelated to the prompt, obviously false on sight, or true-but-irrelevant — no
  informed *or* uninformed learner would seriously pick them, so they add no
  signal.
- **Make options homogeneous with the key.** Match length, grammar, specificity,
  and register across all options. A key that is longer, more hedged, more
  precise, or more technical than its distractors is guessable by form alone.
  This includes formatting: do not bold, expand, qualify, or otherwise mark up
  the correct option differently — any readability change must be applied
  uniformly to every option, never just the key.
- **Exactly one defensibly-correct option.** Distractors must be unambiguously
  wrong against the linked assessment criterion — but wrong *for a reason*, not by
  being nonsense. Avoid near-duplicate options and avoid "all/none of the above".
- **Anchor wrongness to the concept under test.** Tie each distractor to the
  concept or material the check covers (and to its `criterionEntityIds` where the
  check links one), so the distractors probe the same understanding the key does.

A practical bar: read the four options cold, with the prompt but without knowing
the key. If you can pick the answer from wording, plausibility, or process of
elimination alone, the distractors are too weak — revise before proposing.

**Fixing a weak check that is already accepted.** You do not create a second
question and you cannot edit a revision in place. Author a corrected candidate
(stronger distractors, key not parked in the first option) and accept it onto the
existing entity by passing its accepted-quick-check entity id as `targetEntityId`.
That writes a new current revision under the same entity: students immediately see
the corrected version, the weak revision stops being delivered, and past attempts
that referenced it stay intact. Use the curator accepted-quick-check list
(`GET /programs/{programId}/quick-checks/curation`) to find the entity id of the
check you are replacing.

## Readiness checks

- **Propose** — `POST /programs/{programId}/readiness-checks/candidates` with
  `{ "title", "scope", "requirements", "sourceIds"?, "rationale"? }`.
  A topic scope is
  `{ "scopeKind": "topic", "topicEntityId" }`; a period scope is
  `{ "scopeKind": "period", "title", "topicEntityIds" }`. Each requirement is
  `{ "targetKind", "targetId", "requiredLevel": "developing" | "on_track" }`,
  where `targetKind` is `assessment_criterion`, `concept`,
  `material_reference`, `open_answer_check`, `quick_check`, or `topic`.
- **List** — `GET /programs/{programId}/readiness-checks/candidates` (filter by
  `status`).
- **Accept / reject** —
  `POST /readiness-checks/candidates/{candidateId}/acceptance`,
  `POST /readiness-checks/candidates/{candidateId}/rejection`.
- **Curator curation detail** —
  `GET /readiness-checks/revisions/{revisionId}/curation`.

A readiness check gates progression on its requirements; expect `rejected`
reasons such as `readiness_requirement_target_not_found` or
`readiness_requirement_program_mismatch` when a requirement points outside the
program's accepted corpus.

## Assessment criteria

Criteria let evaluation be tied to the program rather than improvised per attempt
(CUR-05). Same lifecycle:

- **Propose** — `POST /programs/{programId}/assessment-criteria/candidates`
  with `{ "title", "body", "sourceIds"?, "rationale"? }`.
- **List candidates** — `GET /programs/{programId}/assessment-criteria/candidates`
  (filter by `status`).
- **Accept / reject** —
  `POST /assessment-criteria/candidates/{candidateId}/acceptance`,
  `POST /assessment-criteria/candidates/{candidateId}/rejection`.
- **Read accepted** — `GET /programs/{programId}/assessment-criteria`;
  `GET /assessment-criteria/revisions/{revisionId}` for detail.

Accepted criteria are owned by the program corpus; an open-answer prompt or check
references them rather than carrying improvised, per-attempt rules.

## Learner-state target links

A learner-state target link declares that a check's evidence updates a specific
learner-state target (which topic/concept/check the attempt is evidence *for*):

- **List** — `GET /programs/{programId}/learner-state-target-links`.
- **Create** — `POST /programs/{programId}/learner-state-target-links`.
  Send `{ "evidenceOwnerKind", "evidenceOwnerEntityId", "targetKind",
  "targetId" }`. Evidence-owner kinds are
  `accepted_assessment_criterion`, `accepted_open_answer_check`, or
  `accepted_quick_check`; target kinds are `topic`, `concept`, or
  `material_reference`.
- **Delete** — `DELETE /learner-state-target-links/{targetLinkId}`.

Expect `rejected` reasons like `learner_state_target_not_found` or
`learner_state_target_program_mismatch` when a link points outside the program.
The link defines the *mapping*; it does not read or expose any individual
student's learner state.

## Showing drafts and checks to the curator

When the curator asks to **see, review, or confirm** their drafts or accepted
checks, fetch and present them — do not reply with endpoint paths for the curator
to call. Per [`agonara-api-access`](../agonara-api-access/SKILL.md) ("You are the
interface"), you hold the session, so:

- Call the matching list endpoint with `status=draft` (open-answer, quick-check,
  readiness, or criteria candidates) and render each candidate's title, body or
  prompt, and id inline.
- For a quick check, show the options and — from the curator-only
  `GET /quick-checks/revisions/{revisionId}/curation` view — the correct option,
  so review is possible without leaving the conversation. Apply the
  distractor-quality bar above as part of this review: name the mistake each
  distractor encodes, and flag any throwaway or guessable-by-form option for
  revision before acceptance instead of accepting a contract-valid but weak check.
- Only when the curator wants a browsable surface of their own, point them at the
  instance's `/learn` Curator review UI — after you have already shown the drafts.

## Boundaries this skill keeps

- **Keys stay curator-only.** Never surface `/curation` detail (answer keys,
  correct options, correctness) toward students.
- **No student attempt or progress flows.** Submitting attempts, reading
  results, weak areas, or learner state for a student is the student's job, not
  the curator's — stay out of it.
- **Corpus structure is elsewhere.** Topics/concepts/materials/navigation live
  in [`agonara-curator-corpus`](../agonara-curator-corpus/SKILL.md); this skill
  attaches checks and criteria to that accepted structure.
