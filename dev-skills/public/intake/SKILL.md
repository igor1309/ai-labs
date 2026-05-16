---
name: intake
author: Igor Malyarov
version: "1.4.1"
description: >
  Use when starting work on a task — assigned implementation, bug report,
  vague requirement, or open-ended exploration — even if the user doesn't
  say "intake" or "research." Trigger phrases: "/intake", "here's your
  task", "implement this", "fix this bug", "there's a bug", "explore X",
  "before we commit", or a bare task reference (step number, PR, doc path).
  Planning or coding from shallow context produces wrong solutions; this
  skill forces a deliberate context-capture step before any downstream work
  begins. Stops cleanly — no auto-transition to planning or implementation.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Task, AskUserQuestion, Write
---

# Task Intake

Capture context — task understanding, codebase findings, risks, and open
questions — as a reusable brief before any planning or coding. Then stop.

The assignment is: $ARGUMENTS

If `$ARGUMENTS` is empty, infer the task from the conversation context. If no
task is apparent, ask the user what they'd like you to start from.

## Core Principle

The spec is authoritative. Read before you ask. Capture context before
anything downstream begins. Never guess.

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
- Surface what you learn in the brief — relevant constraints in "Key
  Constraints", files and modules the task touches in "What I'm Touching",
  broader patterns and conventions in "Findings."

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

## Phase 2: Output Format

Assemble and present the brief with these sections inline in the
conversation. You'll persist it to a file in Phase 4 after alignment; for
now, this is a draft the user can react to.

Restate in your own words — do not parrot the spec, do not copy-paste from
referenced docs. The brief is your understanding made visible; copy-paste
here produces wrong implementations downstream.

### What I'm Building

The deliverable, in your own words. What does this task produce? What changes
when it's done? This should be a concise description that a developer could
read and say "yes, that's the task" or "no, you've missed the point."

### What I'm Touching

Specific files, modules, types, and patterns from the codebase that this task
involves. Show that you've located the relevant code and understand where the
changes land.

### Findings

Factual observations from the codebase.
Start with two lead bullets:
- `Scope:` what was searched, coverage boundaries, and exclusions. Include counts when relevant.
- `Pattern evidence:` representative analogs or pattern families (or explicit `none found`).

Then include:
- Relevant files and modules (with paths)
- Patterns and conventions used for similar functionality
- Constraints or dependencies discovered

### Key Constraints

Rules, invariants, boundaries, and conventions from the spec and the codebase
that the implementation must honor. These are the things that, if violated,
mean the implementation is wrong regardless of whether it "works."

### Risks & Unknowns

- Things that could go wrong or complicate the task
- Gaps in understanding
- Ambiguities in how existing code behaves

### Reproduction (bug-fix tasks)

For bug fixes, propose a failing test that proves the broken behavior. Include
the test name, what it asserts, and why that assertion fails under the current
bug. This is a specification — describe the test, don't write code.

If the behavior isn't unit-testable, describe the manual reproduction instead.

Omit this section entirely for non-bug tasks.

### Questions

Clarifying questions about the task or approach, if any. Omit this section if
there are none.

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

### Large-Scope Mode

Use this mode when detailed listing would exceed 12-15 evidence bullets or starts repeating the same pattern.

- Keep the same top-level sections. Do not add extra top-level sections.
- In `Findings`, include a compact coverage summary: files scanned, files deeply read, directories covered, search pattern count, and exclusions.
- Group matches into pattern families with counts and 2-3 representative file paths per family.
- Prioritize conflicts, deviations, and outliers. Do not enumerate repetitive matches.
- Add this line in `Findings`: `Examples are representative; full match list omitted for brevity.`
- If conflicting patterns are present, include a `Conflicts` block inside `Findings`.

## Phase 3: Alignment

If you had questions, the user answers them. Listen carefully. Update your
understanding. If new questions arise from the answers, ask them — still one
at a time.

If the user corrects your understanding in the brief, acknowledge the
correction concretely. Do not just say "got it" — restate the corrected point
so the user can verify you actually absorbed it.

## Phase 4: Capture

When there are no remaining questions — either you had none, or they've all
been resolved — capture the brief and stop:

1. Ask the user where to save the brief (file path).
2. Write the brief — the content you assembled in Phase 2, with any
   corrections from Phase 3 — to that path.
3. Confirm the saved path and stop. Do not propose next steps, do not
   transition to planning, do not ask "what now."

Whether the user moves to planning, refines the spec, raises a blocker, or
does something else entirely is their decision — not yours.

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
- **No solution design.** Do not propose how to implement the task.
  Solutions don't belong in intake regardless of what comes next. Your job
  here is to understand *what*, not decide *how*.
- **Stop cleanly.** After saving the brief, stop. Do not auto-transition to
  planning, implementation, or further investigation. If the user asks for
  solutions while in intake, decline and offer to wrap up the brief instead.

## Anti-Patterns

Concrete ways the Hard Rules get violated in practice. If you catch yourself
doing one of these, you've broken the corresponding rule above.

- **The lazy reader**: Asking the user to explain something that's written in
  the referenced docs. You had the doc path. You should have read it.
- **The spec rewriter**: Quietly changing or "improving" what the spec asks
  for. The spec was prepared with care. Implement it, don't edit it.
- **The parrot**: Restating the spec in the spec's own words. That proves you
  can copy, not that you understand.
- **The question flood**: Dumping all questions at once. One at a time.
- **The premature architect**: Proposing implementation approaches during
  intake. Decline; intake is for understanding, not solutioning.
- **The shallow explorer**: Reading only the primary doc and ignoring the
  codebase. Half the understanding comes from seeing how the code is already
  structured.
- **The exhaustive cataloger**: Reading every file in every referenced folder.
  Be smart about depth — representative samples, not complete inventories.
