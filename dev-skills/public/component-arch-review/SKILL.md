---
name: component-arch-review
version: "1.0.0"
author: Igor Malyarov
description: Use when reviewing an implemented component and you need a principle-driven critique focused on root causes, strategic impact, and verifiable improvement paths rather than a laundry list of code smells.
---

# Component Improvement Review Guideline

Review a component as an architectural health check. The goal is not to lint, rank minor smells, or recommend patterns for their own sake. The goal is to identify the few issues that most materially harm changeability, testability, cohesion, or long-term maintainability.

## When to Use

Use this guideline when:

- reviewing an implemented component, service, module, or subsystem
- the user wants strategic architectural feedback rather than line-by-line code review
- the value lies in root-cause analysis and high-leverage recommendations

Do not use this as a generic code review rubric. If the task is mainly about correctness, regressions, or small implementation defects, use a normal review flow instead.

## Core Stance

- Reason from first principles, not from smell labels alone.
- Prioritize strategic impact over trivial correctness.
- Prefer one deep, well-supported finding over twenty shallow ones.
- Explain why the issue matters in practice: change cost, coupling, testability, reliability, or scaling pressure.
- Be willing to say the evidence is insufficient.

## Review Workflow

### 1. Define scope and evidence

Before judging the component, establish:

- what was reviewed
- what was out of scope
- what evidence is available in code, tests, or surrounding documentation
- what assumptions are necessary because evidence is missing

### 2. Identify root causes, not just symptoms

Do not stop at observations like:

- large class
- many dependencies
- duplicated branching
- hard-to-test logic

Trace each serious issue back to a principle violation or architectural weakness such as:

- mixed responsibilities
- unstable boundaries
- missing abstractions
- policy coupled to framework details
- hidden state or dependency seams that block testing

### 3. Rank findings by strategic impact

For every possible finding, ask:

- Does this materially harm the component's ability to change?
- Does this materially harm understanding or testability?
- Does this create compounding complexity or maintenance risk?

If not, deprioritize it or omit it.

### 4. Show principled rationale explicitly

For each significant finding, make the reasoning visible:

- observation
- principle violated
- concrete impact
- evidence
- verifiable improvement path

The report should read like an argument, not a slogan.

### 5. Self-critique before finalizing

Before finalizing, check:

- Does the report tell a coherent story about the component's health?
- Did I prioritize causes over symptoms?
- Did I recommend a pattern because it solves a real problem, or because it sounds architecturally neat?
- If I could keep only one recommendation, which one would matter most?

## Output Format

Produce a Markdown report with this structure:

```markdown
# Component Review — <Component Name>

## Executive Synthesis
<A short paragraph explaining the central architectural challenge or risk.>

## Scope & Inputs
- Reviewed: ...
- Out of scope: ...
- Assumptions made: ...

## Strategic Findings
| Priority | Finding | Strategic Justification |
|:---|:---|:---|
| Critical / High / Medium | ... | ... |

## Detailed Analysis

### Finding: <Title>
- Observation: ...
- Evidence: <file path, symbol, lines where possible>
- Principled Rationale: ...
- Strategic Impact: ...
- Actionable Path: <desired end state, not vague advice>

## Blocked
- <Areas where analysis is limited by missing evidence>
```

## Heuristics

Use these lenses to guide the review:

- **Responsibility and Purpose**: Is the component's purpose singular and clear?
- **Boundaries and Abstractions**: Does core logic depend on stable abstractions or on external details?
- **Change and Extension**: Does similar future work require modifying existing code or adding new code cleanly?
- **Testability and Seams**: Can core behavior be exercised without real infrastructure?
- **Complexity and Simplicity**: Is the complexity inherent to the domain or created by the design?

## Constraints

- Be evidence-based.
- Do not speculate beyond what the code supports.
- Do not produce a long tail of low-value findings.
- Do not recommend patterns without tying them to a concrete problem.
- Prefer end-state recommendations over vague advice.
- Mark blocked areas explicitly instead of guessing.
