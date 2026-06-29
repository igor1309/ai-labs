---
date: 2026-06-29
model: claude-opus-4-8
description: "Intake brief — two quality failures in agonara-student's LLM-authored MCQ practice-quiz loop, with proposed fixes (Codex-reviewed)"
---

# agonara-student authored-quiz quality — intake brief

## Scope

Concerns the **LLM-authored MCQ practice-quiz path only** — the assistant
generating multiple-choice Q&A from the material to coach with (SKILL.md
"tests you generate earn their distractors", lines 140–145). The two fixes
target **assistant-authored MCQ items**; non-MCQ authored prompts (open practice
questions) are not addressed here. NOT in scope: the accepted-corpus check flow
(`## Check and assess`, STU-11/12/13/14, API submit/grade, lines 250–299).

Single file in play: `agonara/skills/agonara-student/SKILL.md` (v1.4.0).

## The two pains

1. **Weak distractors.** LLM-authored items come out trivially pickable — the
   student gets them right without knowing the material.
2. **No correctness feedback.** After the student answers, the assistant advances
   to the next question without saying right/wrong and why. No API/accepted check
   is involved — this is informal coaching the assistant owns, and it's dropped.

Root cause (both): the MCQ item-quality rules (lines 166–248) are **already
mandatory** ("Hold every question to the bar", "Apply them to every question"),
but the authored-quiz loop has **no explicit self-check and no stop condition** —
nothing forces the agent to verify the rules before presenting, and nothing
forces a correctness step before advancing. The fix is enforcement, not new
rules.

## Fixes (two surgical SKILL.md edits)

### Fix 1 — Question Definition-of-Done gate

Add a `Definition of Done` to the authored-MCQ path (mirroring
`skills/agonara-curator-corpus/concept-extraction.md`'s DoD + anti-failure rule).
The gate is **"all MCQ item-quality requirements (lines 166–248) pass"** — not a
new subset — covering the stem rules (cover-the-options, application over recall,
no negative stems), structure rules (exactly one defensibly-correct option, no
near-duplicates / all-none, logical numeric ordering, no cross-item cueing), and
the cue/homogeneity rules. Call out as the **anti-failure focus**: every
distractor names a real, stateable misconception, and the item clears the
cold-read test (key not pickable by length, grammar, absolutes, wording, or
elimination). Note the position check has two levels: item-level option ordering
and set-level key-position distribution. Anti-failure rule: *"plausible-looking
options is not done — each distractor must be a nameable mistake."*

### Fix 2 — Required assess-then-advance step

Add a per-item rule to the loop (mirroring `skills/button-quiz-loop/SKILL.md`'s
required checklist): after the student gives a **clear final answer**, the
assistant **must**, immediately and before the next question, deliver a
correctness verdict that explains *why the correct answer is correct*, *why the
selected answer was wrong* (if it was), and the misconception each wrong option
encodes. "Advance without assessing" is an explicit protocol failure. If the
answer is unclear, multiple, or non-final, ask for clarification and **do not
advance** (the assistant relays only what the student stated; it never picks for
them).

**Decision (confirmed):** feedback timing is *immediate, then advance*.

### Cross-cutting — private rationale record

Fix 2 needs the very misconceptions Fix 1 required at generation time. So: when
the assistant generates an item, it records the key and each distractor's
nameable mistake **privately** (not shown), and reveals them only as part of the
post-answer feedback. This connects the two fixes and keeps the answer hidden
during the attempt.

## Constraints any fix must honor

- Stay coaching, not test-taking (assessment boundary, lines 127–164): the
  assistant marks its own authored questions; no accepted-check key/correctness
  metadata, no API grade path.
- Each authored item should anchor internally to its accepted source material /
  concept under test (lines 115–124, 140–145, 196–197) — distractor wrongness
  probes the same concept the key does.
- Before a final answer, if the student is stuck or asks for a hint, offer to
  return to studying the concept — never an answer-directed hint (lines 156–164).
- Uniform formatting across options (lines 149–152, 220–222) — the feedback step
  must not retroactively single out the key.
- Documentation-only change; match the skill's existing voice and the family's
  DoD/checklist precedents.

## Status

Intake only. No code/skill changes made. Codex-reviewed; accepted findings folded
in. Verification examples (a weak item rejected by the gate; an item with private
rationales revealed post-answer; immediate feedback before the next question) and
re-checking exact line citations belong to the planning step, not this brief.
