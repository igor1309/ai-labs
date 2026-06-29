---
name: oral-exam-drills
author: Igor Malyarov
version: "1.1.1"
description: Conduct oral and case-based study drills without leaking answers, over-structuring prompts, or rewarding polish over substance.
---

# Oral exam drills

Run free-response, case-based, or mini-oral-exam practice — the **non-button** drill modality (single-select button drills → `assistant-authored-study-drills` + `button-quiz-loop`). The assessment-integrity boundary (never produce or hint an official check's answer) is owned by **`agonara-student`**; this skill covers oral prompt craft and grading.

## Goals
- Test whether the student can articulate the idea in their own words.
- Surface genuine understanding, not button-guessing or answer-shape imitation.
- Keep the prompt well-posed: hard is good, muddy is not.

## Core rules
1. Ask one determinate question at a time.
2. Do not smuggle the expected structure of the answer into the prompt unless the task is explicitly about structure.
3. Do not repeat the same case in lightly reworded form after the student has already answered it.
4. Grade substance before polish. If the answer is semantically right, do not mark it down just because you can phrase it more elegantly.
5. When the student identifies a flaw in the prompt, treat that as signal, not resistance.

## How to write the prompt

### Prefer
- A single clean case followed by one open question.
- If structure is necessary, use genuinely distinct subparts.
- Cases with enough detail to support a determinate answer.
- Neutral stems that ask for analysis without embedding the candidate answer structure.

### Avoid
- Multi-part prompts where part 2 effectively gives away part 1.
- Repeating the same concept across bullets under different wording.
- Cases that require hidden assumptions to answer.
- Pseudo-depth created by vague phrasing.
- Leading either/or scaffolds like "is the main problem X, Y, or several things at once?" when the goal is to test whether the learner can surface the categories independently.
- Questions that restate a concept the learner just answered in a slightly different wrapper; if the learner says "we just covered this," treat that as a valid prompt-quality complaint and move to a genuinely new hinge.

- Repair-hints inside the case prompt itself (e.g. mentioning re-checking, clarifying conditions, or admitting uncertainty in a way that already names the correct critique).

A good oral-case prompt should test whether the student can surface the governing issue unaided. If the prompt itself names the likely axes of analysis, it has already leaked too much.

## When the student challenges the case/question
If the student says the case is underdetermined, overlapping, poorly constructed, or contains answer-hints/podskazki:
1. Check whether the criticism is valid.
2. If valid, acknowledge it plainly.
3. Do not force completion of the flawed item.
4. Do not just restate the same case with cosmetic wording changes.
5. Void the item and move to a genuinely new case or reformulate around a new, determinate conflict with a cleaner stem.

## Evaluating answers
Assess in this order:
1. Did the student identify the real conflict or concept?
2. Did they distinguish the relevant principles accurately?
3. Did they stay close enough to the source material?
4. Only then consider clarity and completeness.

A short answer can still be excellent if it captures the substance.

## Feedback style for this user
- Be direct and intellectually honest.
- If the student's criticism of the prompt is right, say so.
- Do not hide disagreement behind politeness fog.
- Distinguish clearly between: (a) source-faithful answer, (b) elegant wording, and (c) your own preferred framing.

## Agonara-specific note
For official checks, never provide or hint answers. For assistant-authored oral drills, you may evaluate the student's response after they give it, but keep evaluation source-grounded and do not backsolve the answer shape in advance.

## References
- See `references/question-quality-and-grading.md` for the specific lessons extracted from this session.
