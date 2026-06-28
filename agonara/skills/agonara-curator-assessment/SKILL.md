---
name: agonara-curator-assessment
author: Igor Malyarov
version: "1.6.0"
description: Assist a human Agonara Program Curator to author assessment — open-answer checks, quick checks, and readiness checks via the candidate→acceptance→revision flow, define program-owned assessment criteria, link checks to learner-state targets, and keep answer keys and correctness curator-only (never student-facing). Treat your own drafts and reports as untrusted: present a numbered list, the curator verifies each candidate (and its answer key) against trusted state and approves by explicit item number before you accept, acceptance is per item not batched, and any acceptance lacking that verification is contaminated. Use when a curator's assistant agent is adding or accepting checks or criteria on a program. Builds on the corpus skill; checks attach to accepted corpus entities.
trigger: when a curator's assistant agent needs to author or accept a check (open-answer, quick, readiness), define assessment criteria, or manage learner-state target links
---

# Agonara curator assistant — assessment

Author the ways a program verifies understanding: **checks** (open-answer, quick,
readiness), **assessment criteria** that evaluation is tied to, and the
**learner-state target links** that say which checks produce learner-state
evidence.

**You are the curator's assistant, not the curator.** A human Program Curator
owns the program and its decisions; you do the API work on their behalf and
confirm choices with them — you don't decide for them.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for auth, the
`X-Agonara-CSRF` header on mutations, and the envelope. Checks and criteria
attach to accepted corpus entities, so this skill builds on
[`agonara-curator-corpus`](../agonara-curator-corpus/SKILL.md) and reuses its
draft↔accepted (candidate→acceptance→revision) lifecycle — propose a candidate,
review it, then explicitly accept (never auto-accept).

## The acceptance gate — your work is untrusted until the curator verifies it

This skill mutates accepted program state — accepting checks and criteria, and
creating learner-state target links — so the **acceptance gate and contamination
doctrine in [`agonara-curator-corpus`](../agonara-curator-corpus/SKILL.md) govern
here without exception.** In short: proposal and acceptance are separate phases;
you may propose freely but **must not** accept in the same run; you present a
**short numbered list** and the curator approves by **explicit item numbers or
ranges** (`accept 1,3` / `accept 1-8`) — never make them type ids, never
synthesize the selection yourself, and reject any non-specific approval (a bare
"all", "everything", "yes", "looks good") as no selection (see the corpus gate);
the curator's own inspection of trusted state —
not your pasted read-back — is the authority; you resolve the numbers to ids and
echo what you will accept before accepting; and any accepted entity lacking a
curator verification record is contaminated by default. Re-read that section; it
is not repeated here.

On top of it, these assessment paths carry trusted state the curator must verify
before they pick a number:

- **Verify the draft candidate before accepting; the revision only when revising.**
  Acceptance acts on a **draft candidate**, so pre-acceptance verification reads
  the candidate, not a revision: present it from its candidates list
  (`GET /programs/{programId}/quick-checks/candidates`,
  `…/open-answer-checks/candidates`, `…/readiness-checks/candidates`,
  `…/assessment-criteria/candidates`) — for a quick check its prompt, options, and
  answer key; for a readiness check its scope and every
  `{ targetKind, targetId, requiredLevel }`. The `/curation` revision reads
  (`GET /quick-checks/revisions/{revisionId}/curation`,
  `…/readiness-checks/revisions/{revisionId}/curation`) are for **accepted**
  revisions — use them for the before/after when revising in place, not as a
  substitute for candidate read-back. If a candidate read-back cannot show the
  curator the answer key they are approving, do not accept.
- **The key is the thing to verify.** A check's value is its key/correctness; never
  let the student-safe delivery view stand in for the key, and a check accepted
  without the curator verifying its key against the source is contaminated.
- **Revising an accepted check or criterion** — `targetEntityId` on any of the
  open-answer / quick / readiness / criteria acceptances — overwrites accepted
  content students may already see. Present the current accepted revision read-back
  (the curator `/curation` or accepted list) and the proposed candidate as a
  before/after the curator can diff; when the curator picks that item's number,
  **echo both the `candidateId` and the `targetEntityId`** you will use before
  accepting.
- **Learner-state target links are direct mutations, not candidates.**
  `POST /programs/{programId}/learner-state-target-links` and
  `DELETE /learner-state-target-links/{targetLinkId}` change accepted mapping with
  no candidate flow to gate them. To **create**, verify that
  `evidenceOwnerEntityId` and `targetId` resolve to accepted entities in trusted
  state. To **delete**, first fetch
  `GET /programs/{programId}/learner-state-target-links` and present the links as a
  **numbered list** with each one's `evidenceOwnerKind`, `evidenceOwnerEntityId`,
  `targetKind`, and `targetId`; the curator picks the number, you echo the resolved
  `targetLinkId`, and you delete only that one — never infer it from the endpoint
  ids alone. Take an explicit numbered selection either way.
- **Reject only on the curator's call.** Acceptance and rejection are both
  curator-owned dispositions: you propose, the curator disposes. Do not reject a
  check or criterion candidate the curator has not chosen to reject — surface it
  and let them decide.

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

**You author the assessment; you do not perform it.** A curator's entire role in
assessment is to author and revise the checks and criteria. Grading an answer is
not a curator operation: quick checks are scored deterministically at submission,
and open answers are evaluated by the student-side evaluator against your accepted
criteria — both happen in the student's own session, not yours. The API enforces
this (a curator session reading attempts gets `participation_required`), so if you
are ever asked to "assess the students' answers," that request is mis-routed:
point it back to the student-side flow, and confine your part to making the checks
and criteria good enough that the automatic evaluation is fair.

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
- **Read accepted** — `GET /programs/{programId}/open-answer-checks` lists the
  program's accepted open-answer checks, each carrying its accepted entity id and
  current revision id; this is how you discover the entity id to pass as
  `targetEntityId` when revising one in place.
  `GET /open-answer-checks/revisions/{revisionId}` gives one revision's detail.

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

### Item quality (the options carry the difficulty)

A single-select check is only as good as its wrong options. Satisfying the
contract — two non-empty options, one key index — does **not** make a usable
check. The default failure mode is a question a learner can answer without
understanding the concept, by reasoning about the *options* instead of the
*material*.

The item-quality requirements that follow are the established evidence-based
item-writing guidelines (Haladyna/Downing/Rodriguez; the NBME item-writing guide;
Rodriguez's option-count meta-analysis; the answer-position research).

#### The stem

- **Pass the cover-the-options test.** A learner who knows the material should be
  able to read the prompt alone and form the answer *before* seeing the options.
  If the prompt only makes sense once the options are visible, it is testing
  option-comparison, not knowledge — rewrite it.
- **Test application, not bare recognition.** Low-level recall prompts are the
  single biggest source of distractors nobody picks: when the prompt is trivial,
  every wrong option is obviously wrong. Ask the learner to apply, distinguish, or
  reason so the distractors can carry real misconceptions.
- **Avoid negative stems.** Don't phrase the prompt as "which is NOT / EXCEPT" —
  it inverts the task and trips careful learners. If a negation is unavoidable,
  make it visually unmissable (caps: `NOT`).

#### Every distractor encodes a real mistake

- **Nameable mistake only.** A distractor should be what a learner believes if
  they hold a specific misconception, did a partial or half-remembered version of
  the reasoning, or confused two related ideas under study. If you cannot state
  *which* error an option represents, it is filler — replace it.
- **No throwaways, jokes, or off-topic options.** Reject options that are absurd,
  unrelated, obviously false on sight, or true-but-irrelevant — no informed *or*
  uninformed learner would seriously pick them, so they add no signal.
- **Anchor wrongness to the concept under test**, so the distractors probe the
  same understanding the key does.

#### Kill the cues that leak the key

A test-wise learner exploits these to score without knowing the material; every
one is a known item-writing flaw. Make options **homogeneous** so none of these
single the key out:

- **Length is the #1 leak.** The correct option is most often the longest, most
  qualified, most complete one — because the writer adds care to it. Keep all
  options in a tight length band; flag any item where the key runs markedly longer
  (~30%+) than the mean distractor and rebalance.
- **Grammar.** Every option must complete the stem grammatically. A distractor
  that doesn't agree (article, number, tense) gets eliminated for free.
- **Absolutes and determiners.** "always / never / only / all / none" read as
  giveaway-wrong; don't park them in distractors or you hand out eliminations, and
  don't let the key be the lone hedged "expert-sounding" option.
- **Vague frequency words.** Avoid "often / usually / rarely" in options — even
  experts don't define them consistently, so they add construct-irrelevant noise.
- **Word repetition / clang.** Don't echo a distinctive stem word in the key
  alone; the verbal match cues it.
- **Convergence.** Don't let the key be the option that shares the most elements
  with the others — test-wise learners pick the "most-overlapping" option.
- **Formatting.** Do not bold, quote, bracket, expand, qualify, or otherwise mark
  up the correct option differently — any readability change applies uniformly to
  every option, never just the key.
- **Position.** The correct answer must not be predictable by position. Don't let
  the key cluster on one slot across the set; place each key by content, not
  habit. If the correct option is systematically in the same position (commonly
  the first, or a middle slot), the set is guessable by position and the offending
  items need reworking, not just a single fix.

#### Structure

- **Exactly one defensibly-correct option.** Distractors must be unambiguously
  wrong against the concept under test — but wrong *for a reason*, not by being
  nonsense.
- **3–4 options, varied across the set.** Three to four functioning options is the
  sweet spot — fewer wastes a question, more invites filler. Don't fix every
  question at the same count; varying it keeps the count itself from being a tell.
  Keep an option only if it is a real distractor by the rules above.
- **No near-duplicates and no "all / none of the above."** Overlapping options
  enable logical elimination; "all of the above" lets partial knowledge pass and
  "none of the above" tests only that distractors are wrong.
- **Order numeric or chronological options logically** (ascending/descending), not
  randomly — illogical order is itself a needless cue.
- **Items must not cue each other.** Don't let one question reveal the answer to
  another across the set.

A practical bar: read the options cold, with the prompt but without knowing
the key. If you can pick the answer from wording, length, plausibility, position,
or process of elimination alone, the item is too weak — revise.

**Applying this as a curator.** "Position" is `answerKeyOptionIndex`; check its
spread across the program with the curator list
(`GET /programs/{programId}/quick-checks/curation`, which exposes every key), and
rework checks whose keys cluster. Where a check links assessment criteria, anchor
each distractor to its `criterionEntityIds` as well as the concept.

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
  `POST /readiness-checks/candidates/{candidateId}/acceptance` (optionally
  `{ "targetEntityId" }` to revise an accepted readiness check in place),
  `POST /readiness-checks/candidates/{candidateId}/rejection`.
- **Read accepted** (curator list) —
  `GET /programs/{programId}/readiness-checks/curation` enumerates the program's
  accepted readiness checks, each with its accepted entity id and current
  revision id; this is how you discover the entity id to pass as `targetEntityId`
  when revising one in place. (The student-safe delivery list
  `GET /programs/{programId}/readiness-checks` is gated to student participation
  and is not a curator discovery surface.)
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
  `POST /assessment-criteria/candidates/{candidateId}/acceptance` (optionally
  `{ "targetEntityId" }` to revise an accepted criterion in place),
  `POST /assessment-criteria/candidates/{candidateId}/rejection`.
- **Read accepted** — `GET /programs/{programId}/assessment-criteria` lists the
  program's accepted criteria, each with its accepted entity id and current
  revision id; this is how you discover the entity id to pass as `targetEntityId`
  when revising one in place.
  `GET /assessment-criteria/revisions/{revisionId}` gives one revision's detail.

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
  item-quality bar above as part of this review: name the mistake each distractor
  encodes, and flag any throwaway, guessable-by-form, or predictably-positioned
  option for revision before acceptance instead of accepting a contract-valid but
  weak check.
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
