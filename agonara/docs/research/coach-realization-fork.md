---
date: 2026-06-29
model: claude-opus-4-8
description: "Problem-space research on whether the coach capability is realized as ephemeral skill behavior or new persisted coaching state, plus the coupled skill-decomposition and nomenclature-priority questions."
---

# Coach realization fork: ephemeral skill vs persisted coaching state

## Purpose

Frame the fork left open by [`coach-persona-intent.md`](../intent/coach-persona-intent.md)
("Open product questions") so a pre-ADR can decide it instead of an implementation
quietly deciding it. The central question: **is the coach realized as ephemeral,
in-session agent behavior derived from existing reads, or does it need new persisted
coaching state on the backend?** Two coupled sub-questions the intent also flagged are
developed enough to be decidable next: whether teaching craft (COACH-01..04) warrants
its own skill, and where the nomenclature priority of COACH-07 is grounded.

This is problem-space framing, not a decision. The recommended leans below are
provisional inputs to pre-ADR, not commitments.

## Baseline — what the system already gives the coach for free

These are the constraints that shape the fork. The coach is a BYOA agent acting for the
student through the contract, so anything it can compute in-session costs nothing on the
backend.

- **learner-state reads** already expose weak topics/concepts, the *evidence* behind
  each label (attempts, answers, feedback), and the next step — and they are **read-time
  derived**, with no persisted cache (README: "no invalidated learner-state cache records
  planned beyond the implemented read-time derivation"). This is the raw material for
  cause-diagnosis (COACH-02) and weak-zone priority — already available, no new state.
- **Accepted corpus** gives `concept_prerequisite` (COACH-03) and confusable pairs
  (COACH-04, STU-07) — already available.
- **Persisted-state policy is a hard constraint.** README: "new persisted product state
  needs a separate spec." Any cross-session coaching memory is a deliberate departure
  from the current derivation-only learner-state model, not a free addition.
- **Assessment-integrity boundary** (ADR-011, ADR-016): the coach must never produce the
  student's assessment evidence. Practice drills are **conversational, not persisted as
  program checks** (persisting them would be curation). So drill performance is, by
  construction, *not* part of learner-state today.

## The decisive seam: what must survive across sessions?

The fork reduces to one question asked per capability. Most of the coach needs **no**
persistence; a narrow slice does.

| Capability | Cross-session persistence needed? | Why |
|---|---|---|
| Explanation depth (COACH-01) | No | Re-derivable from accepted materials each session. |
| Cause diagnosis (COACH-02) | No | Re-derivable from `learner-state` evidence each session. |
| Prerequisite-first (COACH-03) | No | Re-derivable from `concept_prerequisite`. |
| Confusable distinctions (COACH-04) | No | Re-derivable from accepted pairs. |
| Two-contour balance in a run (COACH-06) | No | A per-run authoring discipline (now in the drill skill). |
| Authoring nomenclature items (COACH-05) | No | Authored each session from accepted materials. |
| *Which* fixtures the student is weak on | Partly | Official-check weakness is in learner-state; **practice-drill** weakness is not persisted anywhere. |
| Priority triage (COACH-07) | Split | The priority *data* wants to be durable and shared (corpus-side); the student's *standing* against it wants to be durable (learner-side). |
| Spaced repetition / mastery map | **Yes** | A review schedule that resets every session is not spaced repetition. |

**The crux tension.** The richest signal for the factual contour — how the student
performs on practice fixtures — is exactly the data the system deliberately does **not**
persist (drills are conversational). So cross-session nomenclature continuity must either
lean only on persisted *official-check* learner-state (a thinner signal for the factual
layer, since official checks may not densely cover nomenclature), or introduce a new
persisted *coaching* signal — which immediately raises the assessment-integrity question
(below).

## Candidate directions for the fork

### D1 — Ephemeral / skill-only

Coach re-derives everything each session from existing reads; practice history lives only
in the conversation. COACH-01..06 fully realizable; COACH-07 realizable as in-session
inference; spaced repetition **not** realizable.

- **Enables:** all teaching + two-contour drilling within a session, zero backend, zero
  ADR, ships now (the COACH-06 slice already shipped this way).
- **Costs:** no spaced repetition; weak-zone continuity limited to what official-check
  learner-state already captures; the student re-establishes practice weak zones each
  session.
- **Boundary risk:** none — stays entirely in the read-only safe zone.

### D2 — Persisted coaching learner-state (new family)

A new learner-state family records coach-observed practice outcomes (fixture weak/strong,
review schedule), explicitly separated from official attempts.

- **Enables:** spaced repetition, a durable nomenclature mastery map, cross-session
  continuity on the factual contour.
- **Costs:** new ADR, spec, storage, backup/restore, contract surface; departs from the
  derivation-only learner-state model.
- **Boundary risk: high and central.** Must *prove* the persisted coaching signal is not
  assessment evidence and cannot be confused with it (ADR-011/016). A persisted record of
  "how the student did on questions" looks dangerously like graded evidence; the pre-ADR
  must draw that line explicitly or D2 erodes the program's core guarantee.

### D3 — Minimal hybrid (narrow, student-owned artifact)

Persist only a coarse, **student-owned** artifact — a weak-fixture watchlist and an
optional review schedule the student/coach curates explicitly — not auto-derived from
every drill answer.

- **Enables:** spaced repetition and cross-session weak-zone memory, without recording
  per-question performance.
- **Costs:** still needs persistence + spec, but a much narrower contract than D2.
- **Boundary risk: lower than D2** — because it stores a *watchlist/intent* ("revisit
  Schwartz's typology"), not a *performance record*, it is structurally further from
  assessment evidence. This is the most promising shape to test in pre-ADR.

## Sub-question A — does teaching craft warrant its own skill? (bullet 2, додумано)

This is largely independent of the fork: it is live even under D1.

**The seam is clean.** A four-part teaching stack with one owner per concern:

- `agonara-student` — API access, the assessment-integrity boundary, the MCQ
  item-quality bar (owns *what a good item is* and *the rules of the road*).
- `assistant-authored-study-drills` — practice-drill orchestration, now including
  two-contour balance (owns *running a practice set*).
- `oral-exam-drills` — oral/free-response practice (owns *non-button practice*).
- **`agonara-coach` (proposed)** — explanation craft: depth laddering (COACH-01),
  cause-diagnosis-from-evidence (COACH-02), prerequisite-first traversal (COACH-03),
  confusable-distinction teaching (COACH-04). It would **point to** the drill skills for
  practice, the way `assistant-authored-study-drills` already points outward — keeping
  one-owner-per-concern intact.

**Why this is genuinely "додумать" and not obvious.** The open risk is whether
explanation craft is *rule-heavy enough* to be its own skill rather than a section of
`agonara-student`. The precedent cuts in favor: `oral-exam-drills` exists because oral
grading has real craft (prompt construction, no-leak, grading substance over polish).
Explanation has comparable craft — depth laddering without dumping, diagnosing from
evidence rather than re-reading, prerequisite traversal, the distinction-to-preserve in a
confusable pair, and the *teaching-side* of the no-leak rule (explain the concept without
solving a live official check). That is plausibly skill-worthy. But it is borderline, and
the repo has just **consolidated** skills hard (one-owner, distilled bodies) — adding a
skill cuts against that momentum.

**Decision criteria for pre-ADR / skill-review:**
1. Do COACH-01..04 carry rules that change behavior (yes — depth ladder, evidence-first
   diagnosis, prerequisite traversal, teaching-side no-leak), or only vibes (then a
   section suffices)?
2. Would folding them into `agonara-student` push it past the size where on-demand
   loading stays clean? (`agonara-student` is already the largest skill.)
3. Is the explanation/practice seam clean enough that the new skill only *points* to the
   drill skills, not restates them?

**Provisional lean:** a separate `agonara-coach` owning explanation craft, pointing to the
drill skills for practice — *if* it clears criterion 1 with real rules rather than
becoming a thin wrapper. Validate by drafting its rule list before deciding.

## Sub-question B — where is nomenclature priority grounded? (bullet 3, додумано)

COACH-07 needs a *source of truth* for must-know / frequently-tested / rare. The 71/100
episode is partly an instance of the agent **guessing wrong** about what the exam weights
— so ungrounded inference is the failure mode to avoid.

| Option | Grounding | Cost | Reusable across students? |
|---|---|---|---|
| (a) Coach infers from materials in-session | Weak — re-creates the guess that failed | None | No |
| (b) Curator-tagged corpus priority metadata | Strong | New corpus contract field (curator story, ADR-010 boundary, navigation/delivery projections) | Yes |
| (c) Grounded in accepted exam-requirement *sources* | Strong, if such sources exist | None new — reads accepted materials | Yes |
| (d) Student-declared weighting | Medium — student often knows the syllabus | None | No (per-student) |

**The "додумать" insight.** The intent for the product already says programs can be built
from *"экзаменационные требования, стандарты проверки знаний"* — exam requirements and
assessment standards — as accepted sources. So the cheapest *grounded* path is not a new
priority schema (option b) but **option (c): the coach reads accepted exam-requirement
materials and derives priority from them** — no new contract, grounded in real sources
rather than invention. Option (b) is the heavyweight "right" answer only if exam weighting
is *not* reliably present as an accepted source and must instead be curator-asserted as
structured metadata.

**So the real decision hinges on data availability**, not on preference: *is exam
weighting reliably available as an accepted source (→ c, cheap), or must it be curator
metadata (→ b, a corpus-contract change)?* Option (d) is a sensible always-available
fallback the coach can use regardless. Option (a) alone is rejected — it is the failure
mode.

**Coupling note:** option (b) and fork-direction D2/D3 both add backend, but they are
*independent* changes (corpus-side priority vs learner-side mastery). They need not move
together; a pre-ADR can take (c) now and defer any persisted state.

## Open questions (for pre-ADR)

1. **Fork:** D1, D2, or D3? Specifically — is cross-session continuity on the factual
   contour worth introducing persisted coaching state at all, given official-check
   learner-state already persists *some* weakness signal?
2. **If persisted (D2/D3):** how is the coaching signal proven *not* to be assessment
   evidence, against ADR-011/016? (Watchlist-of-intent vs performance-record is the key
   distinction.)
3. **Spaced repetition:** is it in scope for a first coach slice at all, or deferred? It is
   the main capability that *forces* persistence — dropping it likely collapses the fork to
   D1.
4. **Skill decomposition (A):** draft the `agonara-coach` rule list and judge it against
   criterion 1 — real rules or thin wrapper?
5. **Priority source (B):** confirm whether accepted exam-requirement sources reliably
   exist in real programs (→ option c) or whether curator priority metadata is required
   (→ option b, a corpus-contract change needing its own ADR).
