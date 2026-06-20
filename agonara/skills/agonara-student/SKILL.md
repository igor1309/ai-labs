---
name: agonara-student
author: Igor Malyarov
version: "1.1.0"
description: Operate an Agonara instance as a Student through its HTTP API — discover and preview programs without creating state, self-join/leave/rejoin and act on invitations, resume learning and follow the next step, study accepted concepts and materials with navigation intact, present checks and relay the student's own quick, open, and readiness answers, and read feedback, results, and the evidence behind progress. The agent coaches learning but never produces the student's assessment evidence. The student sees only accepted corpus and its own state — never curator drafts, answer keys, correctness metadata, or evaluator internals. Use when an agent acts as a learner against an Agonara instance.
trigger: when an agent works as a Student against an Agonara instance — discovering or joining programs, learning, taking checks, or reading its own progress
---

# Agonara student

Teaches an agent to do a learner's jobs against an Agonara instance: find and
preview programs, manage its own membership, learn within a program's accepted
structure, take checks, and read evidence-backed progress — all through the
contract.

Builds on the two foundations and does not repeat their mechanics:

- [`agonara-api-access`](../agonara-api-access/SKILL.md) — the instance URL,
  password login and the `agonara_session` cookie, the `X-Agonara-CSRF` header
  and the `X-Agonara-Idempotency-Key` on mutations, and the
  `accepted`/`rejected`/`fault` envelope with retry-vs-stop reasoning.
- [`agonara-membership`](../agonara-membership/SKILL.md) — the role-neutral
  participation model: your memberships and invitations, and accept/decline.

The only assumptions are the foundations' assumptions: an instance URL,
Student credentials, and the instance's OpenAPI contract as the source of truth
for routes, bodies, and rejection reasons. No repository, source, or tooling.

## The student boundary (read this first)

The load-bearing rule for this role: **the student sees only accepted corpus and
its own state.** The skill must never read or present any of these — they are
not student-facing surfaces:

- curator candidates or drafts (any `…/candidates` route, candidate-status
  reads),
- answer keys, selected-option correctness, or scoring/correctness metadata,
- acceptance rationale or curation history,
- evaluator/provider internals, raw prompts or model responses,
- another student's attempts, answers, or progress.

To stay inside it: read program structure through the **student-safe** reads
(`navigation`, accepted-corpus, and the `quick-checks` / `open-answer-checks` /
`readiness-checks` *deliveries*), never the curator candidate routes. **Previewing
a program creates no student state.** Learning state is personal and never
changes the accepted corpus. As always, honor the `rejected` reason the API
returns instead of inferring hidden state — a rejection is the contract telling
you where a boundary is.

## Discover and join

Find programs, preview what they cover without committing, and control your own
membership.

- **List programs** — `GET /programs` returns the program shells visible to your
  session (STU-01). To tell *started* programs from ones you have not begun
  (STU-02), cross-reference `GET /program-memberships/me` from the membership
  foundation: a program you hold an `active`/`left` membership in is one you have
  started.
- **Read one program** — `GET /programs/{programId}`.
- **Preview coverage, state-free** — `GET /programs/{programId}/accepted-corpus`
  (optionally narrowed by `acceptedKind=topic|concept`, paged with
  `limit`/`cursor`) and `GET /programs/{programId}/navigation` (the student-safe
  accepted structure) let you see accepted topics, concepts, materials, and
  checks **before** joining (STU-03). These are reads — they create no student
  state.
- **Join or rejoin** — `POST /programs/{programId}/student-membership` (a
  mutation: session cookie + `X-Agonara-CSRF`). The same operation joins a
  self-join program (STU-18) and rejoins one you previously left, reusing your
  existing membership and learning state rather than duplicating participation
  (STU-20). If the program's admission policy does not permit a self-join,
  expect a `rejected` reason (e.g. a `409`) — do not retry unchanged.
- **Leave** — `DELETE /programs/{programId}/student-membership` (CSRF). Leaving
  changes membership status; it does not delete your historical learning
  evidence (STU-19).
- **See your membership state** — `GET /program-memberships/me` shows whether a
  membership is `active`, `left`, or `removed`, separately from any learning
  progress (STU-21).
- **Act on an invitation** — to join a curator-controlled program, accept
  (`POST /program-invitations/{invitationId}/acceptance`, STU-22) or decline
  (`POST /program-invitations/{invitationId}/decline`, STU-23) via the
  membership foundation. Declining creates no membership and no learning state.

## Learn and navigate

Resume where you were, follow the next step, and study within the program's
accepted structure (requires an active membership).

- **Resume and next step** — `GET /programs/{programId}/learner-state` carries
  your current position and the next recommended step, derived from the accepted
  structure and your own state (STU-04, STU-05). Follow its references into the
  navigation reads below.
- **Study concepts** — `GET /programs/{programId}/navigation` for the accepted
  topic/concept structure and `GET /navigation/entities/{entityId}` for a single
  entity's detail: a topic's key concepts, terms, principles, and definitions
  (STU-06), and the distinctions between confusable concepts shown together
  (STU-07). Both are student-safe accepted reads.
- **Mark concepts needing deeper work** — concepts you have not mastered surface
  in your personal learner-state, not in the corpus:
  `GET /learner-state/targets/{targetKind}/{targetId}` with `targetKind=concept`
  reads a concept's state for you (STU-08). This separates "needs work" from the
  accepted corpus, which it never changes.
- **Reach materials and return** — materials are reachable from the topic or
  concept they support and link back, through the same navigation entities
  (`GET /navigation/entities/{entityId}`, and
  `GET /learner-state/targets/{targetKind}/{targetId}` with
  `targetKind=material` for your state on one), so reading stays connected to
  program structure rather than a flat link list
  (STU-09, STU-10).

## The assessment boundary: coach, never test-taker

A second load-bearing rule, distinct from visibility above: an agent may help a
student *learn*, but must never *produce the student's assessment evidence.* The
program's value is that progress is grounded in the student's own attempts; an
agent that answers checks fabricates that evidence (and for open answers an LLM
would be grading an LLM). The instance **cannot** enforce this — your attempts
arrive as an authenticated student session, indistinguishable from the human's —
so the boundary lives here, in how you behave.

- **Coach, not test-taker.** While studying (concepts, materials) tutor freely:
  explain, give analogies, practise on *other* problems, interpret returned
  feedback, surface weak areas. Once a check is the active task, do not produce,
  choose, or reveal its answer.
- **Scribe, not author.** Submit only an answer the student has stated themselves
  in the exchange. Relay their `selectedOptionId` / `submittedAnswer`; never
  originate it, and never auto-submit an attempt the student did not give you.
- **No derivation or leak while a check is live.** Beyond never reading the key
  (visibility rule above): do not work out and reveal the correct option, do not
  draft the open answer, and do not hint toward the answer during the attempt.
  Hints belong to study, aimed at the concept — not the live check.
- **Present faithfully and legibly.** Show the check exactly as delivered — the
  full question and *every* option, enumerated and clearly labelled, nothing
  added, dropped, reordered to mislead, or annotated with a hint — and let the
  student pick. If the student is stuck, offer to return to studying the
  underlying concept, not to supply the answer.

## Check and assess

Honor the assessment boundary above: present the check, let the student answer,
and submit only what the student gives you. Verify understanding through quick
checks, open answers, and readiness checks.
Every submission is a mutation that requires the session cookie, `X-Agonara-CSRF`,
**and** an `X-Agonara-Idempotency-Key` (the contract marks the idempotency key
required for student attempt submissions — generate a fresh key per submission;
see the api-access foundation).

- **Quick checks** (STU-11) — find them with
  `GET /programs/{programId}/quick-checks` (student-safe deliveries) and
  `GET /quick-checks/revisions/{revisionId}` for a delivery's options. Answer
  with `POST /programs/{programId}/quick-check-attempts`, body
  `{ "checkRevisionId", "selectedOptionId" }`. Read your result with
  `GET /quick-check-attempts/{attemptId}`, or list your own attempts with
  `GET /programs/{programId}/quick-check-attempts` (optionally filtered by
  `checkRevisionId`).
- **Open answers** (STU-12, STU-13) — find checks with
  `GET /programs/{programId}/open-answer-checks` and
  `GET /open-answer-checks/revisions/{revisionId}`. Submit with
  `POST /programs/{programId}/open-answer-attempts`, body
  `{ "checkRevisionId", "submittedAnswer" }`. Read feedback with
  `GET /open-answer-attempts/{attemptId}` (or list via
  `GET /programs/{programId}/open-answer-attempts`). The feedback is expressed
  relative to the accepted criteria — strengths, missing points, weak or
  confused areas. You see your own attempt, result, and feedback only; never the
  answer key, correctness metadata, or any evaluator/provider internals.
- **Readiness checks** (STU-14) — list deliveries with
  `GET /programs/{programId}/readiness-checks`, submit with
  `POST /programs/{programId}/readiness-check-attempts`, body
  `{ "readinessCheckRevisionId" }`, and read the outcome with
  `GET /readiness-check-attempts/{attemptId}` (or list via
  `GET /programs/{programId}/readiness-check-attempts`, filterable by
  `readinessCheckRevisionId`). The result indicates whether your current
  evidence supports moving forward.

## Results and progress

Read where you stand, what is weak, and the evidence behind every label.

- **Results and summary** — `GET /programs/{programId}/learner-state` gives your
  check results and progress summary for a joined program (STU-15) and the weak
  topics and concepts to repeat (STU-16). These are personal state and link back
  to the accepted structure through their target ids.
- **Evidence behind a label** —
  `GET /learner-state/targets/{targetKind}/{targetId}` (where `targetKind` is
  one of `topic`, `concept`, `material`, `check`, `readiness_check`) drills into
  a single target and exposes the attempts, answers, checks, and feedback that
  support a "mastered" or "weak" label, so progress is evidence, not just a word
  (STU-17). Follow `targetId` back into the navigation reads to connect a weak
  area to its place in the program.

All of the above is owner-only learner-state: it reflects your own learning and
never mutates the accepted corpus.

## What this skill is not

Recognize these and hand off rather than attempt them:

- **Not curation or authoring** — creating sources, corpus or check
  *candidates*, accepting/rejecting them, or any `…/candidates` read belongs to
  the **curator** skill. The student reads only accepted, student-safe corpus.
- **Not invitation issuance or participant management** — issuing or revoking a
  program's invitations, listing participants, or removing a student belongs to
  the **curator** skill. The student only acts on invitations addressed to it.
- **Not admin or identity** — identity/role management and exceptional
  membership recovery belong to the **admin** skill.
- **Not the membership model itself** — reading memberships and invitations and
  the accept/decline mechanics live in **`agonara-membership`**; this skill
  performs the student-side join/leave/rejoin and leans on that model for the
  rest.
