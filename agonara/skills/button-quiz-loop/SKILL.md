---
name: button-quiz-loop
description: Use when running a button-based quiz/drill in chat and continuity matters more than commentary.
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [quiz, buttons, clarify, agonara, drill, protocol]
    related_skills: [assistant-authored-study-drills, agonara-student]
---

# Button Quiz Loop

## Overview

Use this skill when running a sequential multiple-choice drill through chat buttons.
Its purpose is to prevent protocol breakage: no acknowledgement-only turns, no text fallback unless the user explicitly asks for it, and no meta-explanations during the run.

This skill is for **delivery discipline**, not question-writing quality. Pair it with `assistant-authored-study-drills` for item quality and with `agonara-student` when the questions are official program items.

## When to Use

- The user wants one multiple-choice question at a time.
- The user expects real buttons via `clarify`.
- The user is frustrated by pauses, acknowledgement-only replies, or text-only fallback.
- The runtime may return `clarify.user_response` immediately in the same tool result.

Do **not** use this skill for:
- open-answer prompts,
- plain-text drills the user explicitly requested,
- situations where the user asked to pause after each answer.

## Hard Protocol

Treat this as a strict finite-state rule even if the runtime returns immediately.

### State transition

If `clarify` returns a populated `user_response`, that is the learner's actual selection.

Then do exactly one of the following:

1. If the set is **not finished**: send the **next** question via `clarify` immediately.
2. If the set **is finished**: send the final wrap-up.

No other exit is allowed.

### Button labels carry the option text

Each `clarify` choice's label **is the option's own text** — put the full option on
the button. Never label buttons with bare ordinals (`1`, `2`, …) or letters
(`A`, `B`) while the readable options sit in the prompt, and never add a key that
bridges the two (`1. A`, `2. B`). Two labellings force the learner to translate
button → label → option before answering. The stem goes in the prompt; the options
go on the buttons, once.

## Forbidden outputs between questions

Do not send any standalone message of these forms between button questions:

- `Принял: 3`
- `Верно.`
- `Дальше.`
- any explanation of the cycle
- any text-only restatement of the next item
- any diagnostic commentary about tools or runtime

If you want brief confirmation, bundle it inside the **next** `clarify` prompt, not as a separate assistant turn.

## Required Checklist Before Every Non-final Send

- [ ] This is not the final wrap-up.
- [ ] The next user-facing step is a `clarify` call.
- [ ] The `clarify` call contains all answer options as buttons, each labelled with the option's own text (never a bare number/letter).
- [ ] I am not emitting a standalone acknowledgement message.
- [ ] I am not switching to plain text unless the user explicitly requested that switch.

If any checkbox would be false, stop and repair the step before sending.

## Immediate-response handling

Some runtimes return `user_response` in the same tool result as the `clarify` call.
That is **normal for this protocol**.

Interpretation rule:
- immediate `user_response` = real user answer
- immediate `user_response` ≠ invitation to pause
- immediate `user_response` ≠ reason to explain the tool
- immediate `user_response` ≠ reason to send `Принял`

The correct action is still: **next `clarify` now**.

## Recovery Rule

If you accidentally break the protocol:

1. Do not spend multiple turns explaining the mistake.
2. Re-issue the intended next item in `clarify` format.
3. Resume the chain immediately.

## Common Pitfalls

1. **Acknowledgement trap**
   The assistant sees an answer and reflexively sends `Принял: N`.
   This is a protocol failure.

2. **Format drift**
   The assistant silently switches from buttons to plain text.
   This is a protocol failure unless the user explicitly asked for plain text.

3. **Meta-looping**
   The assistant begins discussing why the cycle broke instead of continuing the drill.
   During the run, this is a protocol failure.

4. **False finalization**
   The assistant behaves as if one answered question completes the local task.
   In a sequential drill, the local task is complete only after the next `clarify` is sent or the whole set ends.

5. **Ordinal-proxy buttons**
   The assistant labels buttons `1/2/3` while the readable options sit lettered in the prompt, forcing a button → option mapping.
   This is a protocol failure: the button label must be the option's own text.

## Verification Checklist

- [ ] Between question N and question N+1 there is no standalone acknowledgement-only assistant message.
- [ ] Every non-final quiz item is delivered through `clarify`.
- [ ] Each button was labelled with the option's own text, not a bare ordinal/letter proxy.
- [ ] Plain-text fallback was used only if the user explicitly wanted it.
- [ ] If `clarify` returned an immediate `user_response`, the next action was another `clarify` or the final wrap-up.
- [ ] The chain preserved momentum instead of diverting into process commentary.
