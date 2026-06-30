---
name: agonara-student
author: Igor Malyarov
version: "1.6.0"
description: Assist a human Agonara Student through the instance's HTTP API — discover and preview programs without creating state, self-join/leave/rejoin and act on invitations, resume learning and follow the next step, navigate accepted concepts and materials and read hosted material content where present, present checks and relay the student's own quick, open, and readiness answers, and read feedback, results, and the evidence behind progress. Owns the API, the assessment-integrity boundary (an agent may help a student learn but must never produce, choose, or submit the student's assessment evidence), and the MCQ item-quality bar — the craft of *explaining* a topic and diagnosing why an area is weak is owned by agonara-coach. The student sees only accepted corpus and its own state — never curator drafts, answer keys, correctness metadata, or evaluator internals. Use when an agent acts as a student's assistant against an Agonara instance — the API, boundary, and checks substrate the coach and drill skills build on.
trigger: when an agent assists a human Student against an Agonara instance — discovering or joining programs, navigating or resuming a program, taking checks, or reading its own progress (explanation/tutoring craft routes to agonara-coach)
---

# Agonara student assistant

Teaches an agent to assist a human learner against an Agonara instance: find and
preview programs, manage the student's membership, learn within a program's
accepted structure, take checks, and read evidence-backed progress — all through
the contract.

**You are the student's assistant, not the student.** A human learner owns their
learning and their answers; you do the API work on their behalf — you coach,
relay the student's own answers, and never stand in for them or produce their
assessment evidence.

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
- **Read hosted material content** — some materials carry their text in-product,
  not just a link. The navigation entity signals this with `hasContent`
  (alongside `contentBytes` and `contentFormat`); when it is set, read the full
  accepted copy with `GET /materials/{entityId}/content` — or a specific revision
  with `GET /materials/revisions/{revisionId}/content` — paged by character with
  `limit`/`cursor` and continued through the returned `nextCursor` (STU-24). This
  is the accepted, self-contained material copy: student-safe like the rest of
  the accepted corpus, and never the curator's raw source content. A material
  without hosted content simply omits the signal — fall back to its
  `locator`/`citation` link as before.

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
  choose, or reveal its answer. The *craft* of explaining well — depth ladder,
  diagnosing why an area is weak, prerequisites-first, splitting confusable
  concepts — is owned by [`agonara-coach`](../agonara-coach/SKILL.md); this rule
  is only the boundary that craft operates within.
- **Tests you generate from the materials earn their distractors.** You will
  often build the quiz yourself — when no prepared check exists, you may compose
  quick checks, quizzes, or practice tests from the accepted materials so the
  student can self-assess (in the conversation, to coach with — not persisted as
  program check candidates; that is curation). Hold every question you write to
  the **MCQ item-quality bar below**, and run the set through the **authored-quiz
  loop below**.
- **Never let formatting betray the answer.** Improving a question's readability
  is welcome, but apply it uniformly to the whole question. Do not bold, expand,
  qualify, hedge, add detail to, or structure the correct option differently from
  the distractors — formatting that singles one option out silently turns "make
  it readable" into "here is the answer." Whatever markup, length, or precision
  the right option carries, give every option the same. This holds both for
  tests you author and when you reformat a delivered check for the student.
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

### MCQ item quality

The item-quality requirements below are the established evidence-based
item-writing guidelines (Haladyna/Downing/Rodriguez; the NBME item-writing guide;
Rodriguez's option-count meta-analysis; the answer-position research). Apply them
to every question you compose for the student.

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

#### Definition of Done — clear this gate before presenting any item

An authored item is presentable only when **all** of the item-quality
requirements above hold together — the stem rules, the cue/homogeneity rules, and
the structure rules. Run it as an explicit self-check, not a vibe: do not present
an item you have not walked against the list. The anti-failure focuses:

- **The item is coherent and on-topic.** The stem is a complete, self-contained,
  unambiguous question; every option — key and distractors — is a direct answer to
  *that* question, of the same kind. An option that does not relate to what the
  stem asks is noise, not a distractor — fix the stem or replace the option before
  presenting. Never present a badly stated question or an option that does not
  answer it.
- **Options match the grain the stem asks for.** If the stem asks for a pair, a
  relationship, a sequence, or "which two…", every option must itself be a
  pair / relationship / sequence — never answer a pair question with single items.
  If it asks for one thing, options are single. A mismatch between what the stem
  requests and the form of the options is a broken item: re-scope the stem or
  rebuild the options so they answer the question actually asked.
- **Every distractor names a real mistake.** State to yourself the specific
  misconception, partial reasoning, or confusion each wrong option encodes. If you
  cannot name it, the option is filler — replace it before presenting.
- **The item survives the cold read.** Read the options with the prompt but
  without the key: if the answer is pickable by wording, length, grammar,
  absolutes, plausibility, position, or process of elimination, it fails — revise
  before presenting. Two of these are mandatory per-option scans, not impressions:
  - **Absolute scan.** Check every distractor for an absolute or limiter
    («только / всегда / никогда / все / ни один / единственный»; only / always /
    never / all / none / sole). One parked in a distractor hands out a free
    elimination — rewrite it, or carry the same limiter across every option so it
    stops being a tell. (An absolute in the *key* alone is the same flaw.)
  - **Parallel structure.** Check that every option shares one form. If the key
    is the odd one out — the only option without a conditional "if/provided"
    clause, the only one phrased differently, the only complete sentence — a
    test-wise learner picks it by shape, not knowledge. Make every option the
    same shape.
- **The key is not parked in an early slot.** Authored sets drift toward putting
  the correct option first or second — counter it on purpose: choose each key's
  position deliberately and spread keys across all slots. Before presenting a set,
  list the key positions and confirm no slot, especially first or second, is
  overused. Spreading across *all* slots includes the first: never using slot one
  is its own predictable pattern ("when in doubt, not the first option"), so the
  key must land in the first slot too, its fair share of the time — do not
  overcorrect into never-first.

Position also has an item level: order the options within an item logically
(numeric/chronological), not randomly.

Run the self-check as evidence, not a verdict. "It passes the cold read" asserted
is worthless — for each item, name the longest and shortest option and flag a
bimodal band (a cluster of long options and a cluster of short ones, with the key
in the long cluster, is a leak even when the key is not *the* longest), list every
absolute you found, and across the set list the key positions. A focus you cannot
show evidence for has not been checked; do not pass an item by rationalising a leak
away.

**Anti-failure rule.** Plausible-looking options is not done — done is a coherent,
on-topic item, every distractor a nameable mistake, the key unguessable on a cold
read, and its position not defaulting to first or second.

## Running an authored MCQ practice quiz

When you build and run a practice quiz yourself (the authored path above), the
loop has a required shape — guidance alone has let items go out weak and answers
go by unassessed.

- **Record the rationale privately, up front.** As you generate each item, note —
  for yourself, never shown — the key and the nameable mistake behind each
  distractor (the same mistakes the Definition of Done required). Reveal them only
  in the feedback after the student answers; until then the answer stays hidden.
- **Gate every item before presenting.** Clear the *Definition of Done* above for
  each question. Do not present an item that has not passed it.
- **Assess before you advance — this is required.** Immediately after the student
  gives a clear, final answer, and before sending anything that advances to the
  next question, state the verdict:
  whether they were right, why the correct option is correct, why their option was
  wrong if it was, and the misconception each wrong option encodes (from your
  private record). Advancing to the next question without this assessment is a
  failure of the loop, not a style choice.
- **Don't assess an unclear answer.** If the answer is ambiguous, gives more than
  one option, or is not final, ask the student to settle on one — do not guess it
  for them and do not advance.
- **Stuck is a study cue, not a hint.** If the student is stuck or asks for help
  before answering, offer to return to studying the concept; never give an
  answer-directed hint during the item.

## Check and assess

Honor the assessment boundary above: present the check, let the student answer,
and submit only what the student gives you. Verify understanding through quick
checks, open answers, and readiness checks.

**Assessment happens at submission, not "later."** There is no deferred-grading
queue and no other persona that assesses afterward — an open answer is evaluated
the moment you submit it, against the accepted check and criteria that exist then,
and the feedback comes straight back on the attempt. So submit each answer in the
same exchange the student gives it; do **not** transcribe answers and promise the
student they will be "assessed later," and never route assessment to a curator —
the curator authors checks but cannot and does not grade attempts. You can only
submit an answer against an **accepted** check (`checkRevisionId`): if the student
answered an ad-hoc question you invented that has no accepted check behind it,
there is no API or graded assessment path: if this was an authored MCQ practice
quiz, give your own correctness feedback through the authored-quiz loop above;
otherwise coach informally and ask the curator to author a real check rather than
implying a graded result exists.

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
