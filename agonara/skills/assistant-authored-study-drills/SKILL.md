---
name: assistant-authored-study-drills
author: Igor Malyarov
version: "1.2.0"
description: Orchestrate assistant-authored MCQ practice drills — provenance, cadence, difficulty shaping, coverage, two-contour balance (meaning and course nomenclature), source-grounding, and live quality repair. Defers item-quality, button delivery, and oral construction to their owning skills.
trigger: when the user wants practice questions you author (drills, mock quizzes, "drill me") rather than official Agonara items
---

# Assistant-Authored Study Drills

Use this skill when the user wants **practice questions you write** rather than official program items. It owns the **drill orchestration** — not the rules that other skills already own.

## This skill owns orchestration; point elsewhere for the rest

- **Item quality** (strong distractors, key-position spread, cold-read resistance, stem–option shape) → the **`agonara-student`** "MCQ item quality" bar. Hold every item you author to it; do not restate it here.
- **Button delivery** (`clarify` continuity, button-label-is-option-text, immediate `user_response`, timeout recovery) → **`button-quiz-loop`**. Run every button drill under it.
- **Oral / free-response / case drills** → **`oral-exam-drills`**. Use it when the drill is not single-select.
- **Per-item assess-then-advance loop** (record the key + each distractor's mistake privately, gate each item, give the required verdict before advancing) → the **`agonara-student`** "Running an authored MCQ practice quiz" loop. Run every authored item under it; don't restate it here.

This skill is what connects them into a coherent authored-MCQ session.

## Trigger

- The user asks to be "drilled" on a topic.
- The user wants non-official practice before or instead of official checks.
- The user asks for a block of ordinary questions followed by a harder/craftier block.

## Core rules

1. **Provenance is explicit.** Say plainly that these are *your* practice questions, not official Agonara items — never let it stay ambiguous.
2. **One item at a time** unless the user explicitly asks for batch delivery.
3. **Acknowledge the commentary, not just the chosen option.** If they answer with a choice plus reasoning, respond to the reasoning briefly.
4. **Respect sequencing literally.** If the user says "1/2/3 in order, not in one message" or "wait for «дальше»", stop after the requested slice and wait.
5. **Assess before advancing.** The verdict's *content* is the `agonara-student` assess-then-advance rule (required, not optional) — don't shrink it to a bare "right/wrong," and don't expand it into a mini-lecture.

## Established cadence beats generic defaults

If a drill has already settled into a working rhythm — `answer → verdict → next question` — preserve it unless the user asks to change it.

- Do not drop the verdict just because you switched to button mode. To keep the button chain unbroken, place it at the **start of the next `clarify` prompt** (see `button-quiz-loop`) — the verdict is still the full `agonara-student` one, just bundled into the next card.
- If you changed the scheme mid-run by accident, say so, restore the prior format, and restart the affected item.

## Difficulty shaping

A good sequence usually has two phases:

1. **Standard understanding** — establish the main distinctions and vocabulary.
2. **Cunning / tricky** — force fine-grained distinctions between near-neighbours: all options defensible at first glance, the key the *most precise* rather than the most slogan-like, targeting boundary confusions and overgeneralizations.

For a "really hard" follow-up block, shift away from term-definition recognition toward near-neighbour case comparisons where 2–3 options are defensible and differ only in the governing principle.

## Coverage when the request is "the whole corpus"

If the user asks to cover all topics / the whole syllabus:

1. build a topic map first (visible, or at least internal);
2. distribute items across the syllabus before deepening one fertile subtopic;
3. do not let a quality fix silently collapse coverage into the easiest-to-write niche;
4. if the user says coverage narrowed, acknowledge it and rebalance the remaining set.

## Two-contour balance: meaning *and* course nomenclature

Coverage above spreads items across the syllabus by **topic**. This is the second
coverage axis — across the **cognitive layer** — and it is just as load-bearing.
Understanding alone is not test-resistance: a learner strong on principles, cases,
and anti-stretch reasoning can still lose real test points on the *nomenclature*
layer (who distinguished what; how an author's classification is named and built;
named categories, types, pairs, lists). A run that trains only the comfortable
analytical contour and skips the factual one leaves that gap intact — the
documented failure mode, not a hypothetical.

- **Train both contours, deliberately.** A substantial run must exercise meaning
  *and* exact course fact, mirroring how the course actually tests — not whichever
  is more elegant to write. If the course checks fixtures (names, typologies,
  categories, author schemes, precise content details), the run checks them too.
- **Required item-type mix.** Across a run, include: principles/distinctions;
  cases/application; authors/typologies/categories/named schemes; and exact details
  from the materials. Don't let the set collapse into the analytical bucket.
- **No drift to the comfortable side.** Catch yourself defaulting to "meaning"
  items because they read better. If you notice the mix has skewed, say so and
  rebalance — same discipline as the topic-coverage rebalance above.
- **Prioritise known-weak fixture zones.** Weight the factual contour toward the
  zones the learner has actually slipped on — named classifications, typologies,
  categories, author breakdowns, exact course content — over zones already solid.
  Use `learner-state` weak areas and prior-session history as the priority signal.
- **Fixture distractors compete on the fixture.** For nomenclature items,
  distractors are adjacent author schemes, neighbouring categories, and near-miss
  formulations — the same confusions the real test exploits. This is the
  `agonara-student` item-quality bar applied to the factual layer (a real nameable
  mistake per distractor); don't restate the bar, instantiate it.
- **Verdict names the error *type*.** Fold into the required `agonara-student`
  assess-then-advance verdict which contour the miss sits in: a logic/reasoning
  error, a plain fact error, a confusion of adjacent categories, or not knowing a
  specific author/scheme. This is a refinement of the verdict's "misconception each
  wrong option encodes," not a replacement for it.

One line: prepare the learner not just to *understand* the course but to survive
*how the course is actually tested*.

## Source-grounded drills

When the user asks for questions "based on the primary source," treat it as a grounding requirement:

- read the original lecture/material/document first;
- build each hinge from an exact distinction, caveat, hierarchy, exception, or formulation in that source;
- make distractors compete by staying close to the source (nearby formulations, adjacent categories, tempting misreadings of the same paragraph);
- when correcting, name the source-level hinge briefly;
- do not imply documentary grounding unless you actually inspected the source this session.

## Teach-then-drill contract

When the user asks you to **teach from the source first, then quiz**, the teaching recap is the contract for the first wave:

- do not test a subtopic you did not introduce in that recap; either add it to the recap first or say explicitly you are expanding beyond it;
- if a section is too large to cover fully, mark what was covered and what was deferred;
- if the user says "that wasn't in your summary," treat it as a valid sequencing complaint, not nitpicking — "it exists in the source" is not a defense.

## Live quality repair

When the user flags an item as weak, leaky, or mismatched — distractors too easy, the key too visible, options that don't answer the stem, or correct answers clumping in one slot:

1. agree plainly if the criticism is right; do **not** defend the item or count it as a clean solve;
2. name what leaked (e.g. one option markedly more precise, distractors too distant, position patterning);
3. void the item and reissue a stronger version on the spot;
4. tighten the remaining set so the same flaw does not recur.

This is the *repair workflow*; for what makes an item strong in the first place, hold to the `agonara-student` item-quality bar.

## Underdetermined-case handling

If the user points out a case is under-specified or supports no single determinate answer:

- treat it as a potentially **strong analytical observation**, not resistance;
- separate what follows from the stated facts from what needs extra assumptions;
- do not "repair" by re-asking about the same factual setup unless they want that;
- reward correct identification of the ambiguity when they still explain the conditional branches.

## Capability questions, answered first

If the user asks whether you can use native Telegram polls or drive an external bot for the quiz, answer the **capability** directly and first (native polls do not work in private 1-on-1 chats; you do not operate other bots). Offer a short alternative only after the boundary answer — do not turn it into a long workaround detour.

## Ending the set

A drill ends; it doesn't trail off.

- **Planned set complete:** close with a short summary — the user's strongest distinctions and remaining weak spots — not another question.
- **Early exit:** if the user stops mid-set, give that same summary for what was covered rather than dropping the thread.
- In button delivery, this summary is the terminal `clarify`-exit (the final wrap-up in `button-quiz-loop`), not a mid-chain message.

## Pitfalls

- Letting an authored drill blur into official assessment handling.
- Restating the item-quality or delivery rules here instead of pointing to their owners (item quality lives in `agonara-student`).
- Ignoring the user's meta-feedback that an item is weak or leaky — repair it (above) instead of defending it.
- Advancing past a "wait for «дальше»"-style cue.

## References

- `references/user-calibration-notes.md` — calibration cues from prior sessions.
- `references/user-specific-preferences.md` — what this user rejects in practice-question design.
- `references/button-flow-failures.md` — concrete button-quiz failure modes and recovery for this user (delivery detail; the canonical rules live in `button-quiz-loop`).
