---
title: "Component Improvement Review Guideline"
version: "1.0.0"
date: "2025-09-20"
description: "Guideline for AI agent reviews of software components with SOLID as foundation and cross-guideline extensions."
status: "stable"
maintainer: "ai-agent-team"
tags: ["guideline", "review", "solid", "design-patterns", "architecture"]
---

# Component Improvement Review Guideline (SOLID-First)

## 1. Purpose & Role
- **Role:** Reviewer only (no code edits); output is a **report**.
- **Goal:** Identify problems and improvements, with **SOLID as mandatory foundation**.
- **Scope:** May extend analysis with other design guidelines (patterns, architecture, testability, performance, etc.).

## 2. Operating Rules
- No assumptions; mark gaps as **Blocked (Insufficient Evidence)**.
- SOLID analysis is mandatory; other checks are flexible and case-driven.
- Cite concrete **evidence** (file path + symbol + short quote).
- Provide **Severity, Impact, Effort, Confidence** for each finding and compute **Priority Score**.
- Focus only on problems & improvements (no positives).

## 3. Output Structure
The AI agent must produce a **Markdown report** with this skeleton:

```markdown
# Component Review — <Component Name>

## Summary
<One-paragraph overview of main risks.>

## Scope & Inputs
- Reviewed: …
- Out of scope: …
- Assumptions: None

## Top Risks
| # | Title | Severity | Impact | Effort | Confidence | Priority |
|---|-------|----------|--------|--------|------------|----------|
| 1 | …     | High     | 5      | 2      | 4          | 10.0     |

## SOLID Assessment
### S — Single Responsibility
- Problem: …
- Evidence: …
- Why it matters: …
- Prescription: …

### O — Open/Closed
…

### L — Liskov Substitution
…

### I — Interface Segregation
…

### D — Dependency Inversion
…

## Cross-Guideline Findings
### Architecture & Boundaries
- Problem: …
- Evidence: …
- Prescription: …

### Cohesion & Coupling
…

### Pattern Opportunities
…

### Testability
…

### Error Handling & Observability
…

### Performance & Concurrency
…

### Naming & Public API Shape
…

## Blocked (Insufficient Evidence)
- …

## Appendix — Finding Details
<Detailed reasoning for top risks.>
```

## 4. Finding Anatomy
Each issue must include:
- **Title**
- **Severity (High/Med/Low)**
- **Impact (1–5)**
- **Effort (1–5)**
- **Confidence (1–5)**
- **Priority Score = (Impact / Effort) * Confidence**
- **Problem → Evidence → Why it matters → Concrete prescription**

## 5. Heuristics
- SRP violations = class mixing IO + business + orchestration.
- Open/Closed = variants should add, not edit.
- LSP = subtypes must honor contracts.
- ISP = clients should not depend on unused methods.
- DIP = depend on abstractions, not concretes.
- Prefer composition, immutability, narrow APIs, seams for testing.

## 6. Pattern Guidance
Recommend patterns **only when concretely beneficial**:
- Strategy vs. switch
- State vs. flags
- Decorator vs. inheritance
- Adapter for external API mismatch
- Facade for complex subsystem
- Composite for trees
- Builder for telescoping constructors

## 7. Definition of Done
- All five SOLID principles addressed.
- Top Risks table completed and ordered.
- Every finding includes evidence + why + prescription + priority.
- Blocked areas clearly listed.
- No speculative claims; no code samples.