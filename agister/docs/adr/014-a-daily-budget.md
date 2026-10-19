---
date: 2026-10-20
model: claude-opus-5-5
description: "ADR-014: home sets a daily budget, a ceiling on what every run's calls spend in a day; a call does not start once the day has spent it"
---

# ADR-014: A daily budget

- **Status:** Proposed
- **Topic:** Running work
- **Date:** 2026-10-20
- **Scope:** a limit on what Agister spends in a day, across runs
- **Decision type:** Architecture
- **Amends:** ADR-001 (invariant 8) and ADR-004 (rule 7)

## Context

A call's process declares its limits, and a run's budgets cover its
descendants (ADR-004, rule 7). Neither bounds many runs: a loop or a
script that starts run after run spends without a ceiling, each run
within its own limits (LAB-34). Calls are independent, sharing only
settings, records and the worktree (ADR-001, invariant 8).

## Decision

Home may set a daily budget: what the calls of every run may spend in a
day, on what their runtimes report. A call does not start once the day
has spent it.

## Rules / Invariants

### 1. Home alone sets it

The budget is the owner's, in home's folder. A repository or a project
cannot set one: given more, it would raise the owner's ceiling.

### 2. The day's spend is what the records hold

The day is the host's, by its clock and time zone. Its spend is the
reported cost of the calls that started on it, read from the runs'
records. An unknown cost spends nothing (ADR-001, invariant 3); a call
taken by a reuse spent on its own day.

### 3. A call does not start on a spent day

A call is checked as it starts: on a day that has spent the budget it
fails, no turn taken. A call running is not ended for the day; a
runtime that takes a budget is given no more than is left.

### 4. A deliberate exception to independence

A call reads what other runs' calls spent: the one thing a call takes
from calls it is not continuing, binding or reusing (ADR-001, invariant
8). It reads the records, never another run's state.

## Consequences

- A runaway of many runs stops at the day's ceiling, the next day
  starting afresh.
- On a runtime that reports no cost, the budget bounds only the calls
  around it: codex's and bash's spend nothing of it.
- Best effort: calls that start together may all pass the check.

## Non-Goals

- A run's own enclosing budget (`backlog/run-path.md`, "Budgets").
- A ceiling over a week or a month.
