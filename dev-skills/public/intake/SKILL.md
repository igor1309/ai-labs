---
name: intake
author: Igor Malyarov
version: "2.0.0"
description: >
  Use when starting work on a task — assigned implementation, bug report,
  vague requirement, or open-ended exploration — even if the user doesn't
  say "intake" or "research." Trigger phrases: "/intake", "here's your
  task", "implement this", "fix this bug", "there's a bug", "explore X",
  "before we commit", or a bare task reference (step number, PR, doc path).
  Planning or coding from shallow context produces wrong solutions; this
  skill forces a deliberate context-capture step before any downstream work
  begins. Stops cleanly — no auto-transition to planning or implementation.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Agent, AskUserQuestion, Write
---

# Task Intake

Capture context — task understanding, codebase findings, risks, and open
questions — as a reusable brief before any planning or coding. Then stop.

The assignment is: $ARGUMENTS

If `$ARGUMENTS` is empty, infer the task from the conversation context. If no
task is apparent, ask the user what they'd like you to start from.

## Phase 1: Homework

Do this silently — no play-by-play of your reading.

**Read the primary task document.** The referenced spec, plan, PR description,
or architecture doc is your source of truth. Read it thoroughly.

**Follow its references, to the depth each one warrants.** A referenced spec or
contract: read the relevant sections. A referenced folder: explore the
structure, read representative files. A referenced type or module: read the
definition and understand its role. You are resolving unknowns from the primary
doc, not cataloging the repository.

**Read the skills whose domain overlaps the task.** Skills loaded in the session
often encode wiring patterns, composition APIs, flow architecture, type
conventions, and process constraints that exist nowhere else in the repo.
Descriptions are summaries; the body holds the rules and gotchas. Read the ones
that overlap, not all of them.

**Explore the code the task will touch.** Files, types, and modules the spec
names or implies; existing patterns for similar functionality; dependencies and
conventions that will shape the implementation. Use `Agent` (Explore) for
parallel exploration when the scope is large, direct Read/Grep/Glob for focused
lookups.

**Answer your own questions first.** When a question forms, check whether the
docs or the code already answer it. Most of the time they do.

## Phase 2: The Brief

Present these sections inline — a draft the user can react to before you persist
it in Phase 4.

Write it in your own words. A brief that restates the spec in the spec's own
words proves you can copy, not that you understand.

**What I'm Building** — the deliverable and what changes when it's done.

**What I'm Touching** — the specific files, modules, types, and patterns the
task involves, with paths.

**Findings** — factual observations from the codebase: relevant files, patterns
used for similar functionality, constraints and dependencies discovered. Say
what you searched and what you excluded, so the reader can judge the coverage.
When enumeration starts repeating the same pattern, group matches into families
with counts and a couple of representative paths, and spend the space on
conflicts, deviations, and outliers instead.

**Key Constraints** — rules, invariants, and boundaries the implementation must
honor. The things that, if violated, mean the implementation is wrong regardless
of whether it "works."

**Risks & Unknowns** — what could go wrong, gaps in your understanding,
ambiguities in how existing code behaves.

**Reproduction** — bug-fix tasks only; omit it otherwise. Propose a failing test
that proves the broken behavior: its name, what it asserts, and why that
assertion fails under the current bug. Describe the test, don't write it. If the
behavior isn't unit-testable, describe the manual reproduction instead.

**Questions** — omit if you have none. Ask only questions whose answer changes
what gets built; anything else is noise you should have resolved yourself. Put
them in a single `AskUserQuestion` call rather than serially — the user answers
once.

Lean on each one. State your take and why, plus a sentence on the strongest
counter — the constraint or context that would flip you. You've done the
homework; you should have a position. "A or B?" is passive. "I'd go with A
because [reason], unless you see something I'm missing" is useful. If you
genuinely lack the context to lean, say so explicitly rather than going neutral.

## Phase 3: Alignment

The user answers; update your understanding. If their answers raise new
questions, ask those too.

When the user corrects you, restate the corrected point concretely so they can
verify you absorbed it. "Got it" doesn't demonstrate anything.

## Phase 4: Capture

Once no questions remain:

1. Write the brief — Phase 2 content with Phase 3 corrections — to the path in
   `$ARGUMENTS` if one was given; otherwise to a sibling of the primary task
   document, or the repo's conventional docs location, named for the task.
2. State the path you wrote to, and stop.

Whether the user moves to planning, refines the spec, raises a blocker, or does
something else is their decision.

## Hard Rules

- **The spec is law.** If you think it's wrong, flag it as an open question.
  Never silently deviate, rewrite, or "improve" it.
- **Read before you ask.** Asking the user something you could have looked up
  spends their time to save your own.
- **No file changes** other than writing the brief in Phase 4. You are in
  intake, not implementation.
- **No solution design in the brief.** Intake establishes *what*, not *how*. If
  the user asks you directly how you'd implement it, answer them — and say the
  answer isn't part of the brief.
- **Stop after saving.** No auto-transition to planning, implementation, or
  further investigation.
