---
name: bug-analysis
version: "1.0.0"
author: Igor Malyarov
description: Analyze a reported bug by tracing the likely execution path, forming evidence-based root-cause hypotheses, and producing a structured debugging report. Use when the task is to investigate or explain a bug before implementing a fix.
allowed-tools: Read, Grep, Glob
---

# Bug Analysis

Investigate a bug as an analysis task. Build understanding from the bug report, the codebase, and any relevant docs. The output is a structured debugging report, not an implementation.

## When to Use

Use this skill when the user wants:

- a structured debugging analysis
- root-cause hypotheses before coding
- execution-path tracing
- a bug report written up as findings, evidence, and next verification steps

Do not use this skill when the user is already asking for a fix to be implemented immediately. In that case, debugging may still happen, but it is part of delivery work rather than a standalone analysis report.

## Before You Analyze

If the user referenced docs, specs, plans, or a PR, read those first.

Then gather the minimum codebase context needed to answer:

- where the symptom enters the system
- which modules or functions participate in the path
- where state or data may diverge from expectation
- what evidence exists, and what is still inference

Do not require the user to provide a giant preformatted bug packet. Adapt to the context available in the repo and conversation.

## Analysis Workflow

### 1. Restate the bug precisely

Extract or infer:

- observed behavior
- expected behavior
- reproduction steps
- environment details, if relevant
- constraints or scope limits from the user

If part of this is missing, say so explicitly.

### 2. Trace the likely execution path

Identify:

- the entry point
- the main modules, functions, or services involved
- important branches, async boundaries, callbacks, or state transitions
- the likely bug manifestation point

Focus on the path most relevant to the reported symptom. Do not catalog unrelated code.

### 3. Form ranked hypotheses

For each serious hypothesis:

- explain why it is plausible
- tie it to specific code evidence when available
- distinguish evidence from inference
- explain the mechanism by which it would produce the symptom

Prefer a small number of strong hypotheses over a long weak list.

### 4. Identify verification steps

Recommend concrete debugging actions such as:

- where to log
- where to set breakpoints
- what inputs or scenarios to retry
- what additional questions would materially reduce uncertainty

These are verification steps, not code fixes.

### 5. State limits clearly

If the available evidence is incomplete, say what is missing and how that limits confidence.

## Output Format

Structure the response as a Markdown report with these sections:

### Executive Summary

- brief bug summary
- most likely cause or causes, if any
- key code areas involved

### Bug Context

- observed behavior
- expected behavior
- reproduction steps
- environment and constraints, if known

### Execution Path

- entry point
- relevant modules and functions
- step-by-step path of control or data
- where the path appears to diverge from expectation

### Hypotheses

For each hypothesis include:

- rationale
- evidence
- confidence
- how it leads to the bug

### Supporting Evidence

- concrete file or symbol references
- relevant code snippets when they materially clarify the issue

### Verification Steps

- logging
- breakpoints
- targeted scenarios
- clarifying questions

### Impact

- why the bug matters if left unresolved

### Assumptions and Unknowns

- explicit assumptions made during analysis
- missing information
- open questions for follow-up

## Constraints

- No code changes.
- No speculative fixes presented as facts.
- Keep conclusions evidence-based and label uncertainty clearly.
- Prefer root-cause reasoning over symptom description.
- If the bug report is weak, improve the framing in the report instead of complaining about the input.
