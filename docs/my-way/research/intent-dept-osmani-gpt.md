---
date: 2026-06-06
author: Igor Malyarov
model: gpt-5.5-thinking
title: The Intent Debt
source: https://addyosmani.com/blog/intent-debt/
version: 0.0.1
---

## Summary

Addy Osmani defines **intent debt** as the missing or decayed record of **why** a system exists in its current form: goals, constraints, rationale, tradeoffs, and non-obvious decisions. It is distinct from technical debt and cognitive debt.  [oai_citation:0‡Addy Osmani](https://addyosmani.com/blog/intent-debt/)

## Core distinction

| Debt type | Where it lives | What breaks |
|---|---|---|
| Technical debt | Code | Change becomes harder |
| Cognitive debt | People’s understanding | The system becomes hard to reason about |
| Intent debt | Written artifacts, or their absence | Nobody knows whether the system still serves the original purpose |

The important claim: **AI agents can help with technical debt and some cognitive debt, but not intent debt.** They can refactor code and explain code, but they cannot know the original human rationale unless it was written down. They can only infer, and inference can easily become confident fabrication.  [oai_citation:1‡Addy Osmani](https://addyosmani.com/blog/intent-debt/)

## Why this matters more with agents

Before agents, teams often carried intent informally: senior engineers, review comments, hallway explanations, inherited habits.

With agents, that model weakens because every agent session starts with little durable context. If intent is not externalized, the user has to keep re-supplying it. Parallel agents multiply that cost. Osmani frames part of “agent orchestration tax” as repeated payment for undocumented intent.  [oai_citation:2‡Addy Osmani](https://addyosmani.com/blog/intent-debt/)

## Examples of intent debt

- An agent removes a guard clause, and nobody knows whether it was accidental cruft or a critical constraint.
- A refactor passes tests but breaks behavior users rely on because the tests captured behavior, not rationale.
- Architecture choices survive without anyone knowing why they exist.

## Proposed fix

Treat intent as a first-class artifact:

1. **Write specs for intent, not implementation**  
   Goals, constraints, non-negotiables, definition of done.

2. **Use `AGENTS.md` as an intent ledger**  
   Not just project setup, but conventions, constraints, and “we do not do X because Y.”

3. **Capture decisions where they happen**  
   Lightweight ADRs / decision logs.

4. **Make agents write learnings back into artifacts**  
   Failed attempts, discovered constraints, and project-specific lessons should become durable context.

## Main takeaway

Code is increasingly cheap. Explanation can often be regenerated. **Intent remains the scarce human input.**

Osmani’s final point: technical debt makes change hard, cognitive debt makes understanding hard, but intent debt makes it unclear whether the system is still solving the right problem at all.