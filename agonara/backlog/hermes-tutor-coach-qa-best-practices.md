---
title: "Hermes Tutor/Coach Q&A Session Best Practices"
created: "2026-06-30"
format: "markdown"
---

# Hermes Tutor/Coach Q&A Session Best Practices

## Core diagnosis

For long tutor/coach Q&A, the agent usually loses grip because it treats the conversation history as memory.

Better pattern: maintain an explicit **session state** and update it every turn.

## Best practices

### 1. Use a visible session contract

At the start, Hermes should lock the coaching mode:

```text
Role: tutor/coach
Goal: help user reach X
Format: one question at a time
Depth: practical / conceptual / expert
Ownership: user decides; agent guides
Stop condition: when X is produced / understood / decided
```

This prevents drift into generic assistant mode.

### 2. Maintain a Q&A ledger

Every answered question should be stored as structured state:

```yaml
answered:
  - question: "What is the goal?"
    answer: "Define product research prompt"
    implication: "Focus on prompt design, not research execution"

open_questions:
  - "What evidence quality scale should be used?"

decisions:
  - "Do not include pricing"
  - "Do not include positioning"
  - "Keep prompt concise"

constraints:
  - "Ask one question at a time"
  - "Options A/B/C"
  - "No generic advice"
```

The important part is **implication**. Raw answers are weaker than interpreted answers.

### 3. Re-ground before every new question

Before asking the next question, Hermes should internally check:

```text
Given the goal, answered questions, decisions, constraints, and open questions:
what is the single highest-leverage next question?
```

This avoids repeated questions and irrelevant branching.

### 4. Use phase-based coaching

Long sessions need phases:

```text
Phase 1 — Intent
Phase 2 — Scope
Phase 3 — Constraints
Phase 4 — Ownership / boundaries
Phase 5 — Output format
Phase 6 — Draft
Phase 7 — Tighten
```

Hermes should know the current phase and move forward deliberately.

### 5. Ask questions from a queue, not improvisation

Instead of generating the next question freely, build a queue:

```yaml
question_queue:
  - clarify output audience
  - clarify depth
  - clarify exclusions
  - clarify freshness window
  - clarify evidence quality
  - clarify final format
```

After each answer, remove resolved items and reprioritize.

### 6. Detect “already answered”

Before asking anything, Hermes should run this check:

```text
Can this question be answered from:
A. explicit user answer
B. earlier user instruction
C. already accepted constraint
D. previous correction by user
```

If yes, use the known answer and continue.

This is probably the most important fix for your case.

### 7. Keep a compact state block

For long Q&A, Hermes should periodically compress context into a small state block:

```yaml
session_summary:
  objective: "Draft concise research prompt for existing company product/family"
  user_prefers:
    - concise
    - no generic theory
    - one question at a time
    - A/B/C options
  exclusions:
    - pricing
    - positioning
  scope:
    - product capabilities
    - user flows
    - UX
    - technical/product landscape
  freshness:
    - last 6–12 months
  current_phase: "evidence quality clarification"
  next_action: "explain evidence quality options, then proceed"
```

This should be injected into the agent’s working context before continuing.

### 8. Separate tutor and executor modes

Hermes needs a hard mode switch:

```text
Tutor mode:
- ask
- clarify
- challenge
- explain options
- wait

Executor mode:
- produce artifact
- apply decisions
- avoid new scope
```

A common failure is mixing the two: still coaching while already executing, or executing before the Q&A is complete.

### 9. Add user-friction signals

When the user says things like:

```text
already answered
why are you asking this
irrelevant
too long
overbloated
```

Hermes should update state immediately:

```yaml
corrections:
  - "Do not re-ask already answered questions"
  - "Keep final artifact shorter"
  - "Treat stated exclusions as binding"
```

Corrections are stronger than preferences.

### 10. Use a recovery protocol

When Hermes loses grip, it should recover with a compact checkpoint:

```text
I have these locked decisions:
A...
B...
C...

I will continue from the next unresolved item: X.
```

Then proceed, instead of apologizing at length or restarting.

## Best operating model

Use this architecture:

```text
User answer
→ parse answer
→ update state
→ detect corrections
→ resolve open questions
→ choose next phase/question
→ ask one question OR execute
```

The key is that Hermes should behave less like a chat participant and more like a **stateful facilitator**.

## Minimal prompt rule for Hermes

Add this to Hermes’ role prompt:

```text
Maintain an internal session state with: goal, phase, answered questions, decisions, constraints, corrections, open questions, and next action. Before asking a question, verify it has not already been answered. User corrections override previous behavior. In long Q&A, advance by phase and ask only the highest-leverage unresolved question.
```
