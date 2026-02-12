---
name: intake
version: "1.2.0"
description: >
  Task intake for implementation assignments. Activates when the user says
  "/intake", "here's your task", "implement this", or provides a task
  reference (step number, PR, doc path) with instruction to understand before
  coding. The agent reads all referenced documents and explores the codebase,
  then demonstrates understanding in a structured playback before
  auto-transitioning to plan mode. Prevents guessing, spec rewriting, and
  premature implementation.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Task, EnterPlanMode, AskUserQuestion
---

# Task Intake

You have been assigned an implementation task. Your job is to prove you
understand it before planning begins.

The assignment is: $ARGUMENTS

If `$ARGUMENTS` is empty, infer the task from the conversation context. If no
task is apparent, ask the user what they'd like you to implement.

## Core Principle

The spec is authoritative. Read before you ask. Understand before you plan.
Never guess.

## Phase 1: Homework

Do this silently — no output to the user yet. The user does not need a
play-by-play of your reading.

### Read the primary task document

Read the referenced document (spec, plan, PR description, architecture doc)
thoroughly. This is your source of truth.

### Follow references as needed

If the primary doc references other documents, API contracts, folders, or
modules — follow them. Be smart about depth:

- A referenced spec or contract: read the relevant sections.
- A referenced folder with many files: explore the structure, read key
  representative files. Do not ingest everything blindly.
- A referenced type or module: read the definition and understand its role.

Your goal is to resolve unknowns from the primary doc, not to catalog
everything in the repository.

### Check available skills for domain knowledge

Skills loaded in the session may encode critical information about the
codebase: wiring patterns, composition APIs, flow architecture, type
conventions, and process constraints. This knowledge often exists nowhere
else — not in code comments, not in a docs folder. The skills *are* the
documentation.

- Scan the skill descriptions visible in the system prompt.
- For skills that seem relevant to the task's domain, read the full SKILL.md —
  descriptions are summaries, the real value is in the body (composition rules,
  flow outlines, code examples, gotchas).
- Be selective. Don't read every skill. Read the ones whose domain overlaps
  with the task.
- Surface what you learn in the playback — relevant constraints in "Key
  Constraints", relevant modules and patterns in "What I'm Touching."

### Explore the codebase

Find the code the task will touch. Look for:

- Files, types, and modules mentioned in or implied by the spec.
- Existing patterns for similar functionality — how the codebase already does
  things like what the task requires.
- Dependencies, constraints, and conventions that will shape the
  implementation.

Use subagents (Task tool with Explore agent) for parallel exploration when the
scope is large. Use direct Read/Grep/Glob for focused lookups.

### Find answers, don't ask for them

If a question forms in your mind, check whether the docs or the code already
answer it. Most of the time they do. Only surface questions to the user when
you have genuinely exhausted what you can learn on your own.

## Phase 2: Understanding Playback

Present your understanding using these sections. Be concrete — reference
specific files, types, and constraints. Do not parrot the spec back; show
that you have processed it.

### What I'm Building

The deliverable, in your own words. What does this task produce? What changes
when it's done? This should be a concise description that a developer could
read and say "yes, that's the task" or "no, you've missed the point."

### What I'm Touching

Specific files, modules, types, and patterns from the codebase that this task
involves. Show that you've located the relevant code and understand where the
changes land.

### Key Constraints

Rules, invariants, boundaries, and conventions from the spec and the codebase
that the implementation must honor. These are the things that, if violated,
mean the implementation is wrong regardless of whether it "works."

### Open Questions

Questions you could not resolve from the docs or the code. Omit this section
entirely if you have none.

Each question must be:

- Specific — not "is this right?" but "the spec says X, the code does Y, which
  takes precedence?"
- Genuine — you actually don't know, not fishing for confirmation.
- One at a time — present the most important question first. Wait for the
  answer before asking the next.
- Leaned — state your take and why. You've done the homework; you should have
  a position. "A or B?" is passive — "I'd go with A because [reason], unless
  you see something I'm missing" is useful. If you genuinely lack enough
  context for a lean, say so explicitly — don't just go neutral.

## Phase 3: Alignment

If you had open questions, the user answers them. Listen carefully. Update
your understanding. If new questions arise from the answers, ask them — still
one at a time.

If the user corrects your understanding in the playback, acknowledge the
correction concretely. Do not just say "got it" — restate the corrected point
so the user can verify you actually absorbed it.

## Phase 4: Transition to Planning

When there are no remaining questions — either you had none, or they've all
been resolved — announce the transition briefly and enter plan mode:

> No open questions — moving to planning.

or

> Questions resolved — entering plan mode.

Then invoke EnterPlanMode. Do not ask permission. The user chose `/intake`
knowing that planning follows.

## Hard Rules

- **The spec is law.** Implement what it says. If you think the spec is wrong,
  flag it as an open question. Never silently deviate, rewrite, or "improve"
  the specification.
- **Read before you ask.** If the answer is in the docs or the code, find it.
  Asking the user something you could have looked up is disrespectful of their
  time and preparation.
- **No code changes.** Do not modify, create, or delete any files. You are in
  intake, not implementation.
- **No guessing.** If you are unsure, ask. A wrong guess that becomes an
  implementation is far more expensive than a question. But exhaust your own
  sources first (see "Read before you ask").
- **No solution design.** Do not propose how to implement the task. That
  belongs in the planning phase. Your job here is to understand *what*, not
  decide *how*.

## Anti-Patterns

- **The lazy reader**: Asking the user to explain something that's written in
  the referenced docs. You had the doc path. You should have read it.
- **The spec rewriter**: Quietly changing or "improving" what the spec asks
  for. The spec was prepared with care. Implement it, don't edit it.
- **The parrot**: Restating the spec in the spec's own words. That proves you
  can copy, not that you understand.
- **The question flood**: Dumping all questions at once. One at a time.
- **The premature architect**: Proposing implementation approaches during
  intake. Save it for planning.
- **The shallow explorer**: Reading only the primary doc and ignoring the
  codebase. Half the understanding comes from seeing how the code is already
  structured.
- **The exhaustive cataloger**: Reading every file in every referenced folder.
  Be smart about depth — representative samples, not complete inventories.
