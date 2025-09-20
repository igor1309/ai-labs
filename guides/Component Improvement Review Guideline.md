---
title: “Component Improvement Review Guideline”
version: “1.2.0”
date: “2025-09-20”
description: “Guideline for AI agent reviews of software components with SOLID and Testability as mandatory foundations, extended with cross-guideline checks.”
status: “stable”
maintainer: “ai-agent-team”
tags: [“guideline”, “review”, “solid”, “testability”, “design-patterns”, “architecture”]
---

# Component Improvement Review Guideline (SOLID + Testability First)

## 1. Purpose & Role
- **Role:** Reviewer only (no code edits); output is a **report**.
- **Audience:** AI agents and human reviewers applying structured, evidence-driven assessments.
- **Goal:** Identify problems and improvements, with **SOLID and Testability as mandatory foundations**.
- **Scope:** May extend analysis with other design guidelines (patterns, architecture, error handling, performance, etc.).

## 2. Operating Rules
- No assumptions; mark gaps as **Blocked (Insufficient Evidence)** and specify what evidence would unblock.
- SOLID and Testability analysis are mandatory; other checks are flexible and case-driven.
- Cite concrete **evidence** (file path + symbol + short quote + line numbers).
- Provide **Severity, Impact, Effort, Confidence** for each finding and compute **Priority Score**.
- Focus only on problems & improvements (no positives).
- **Conflict resolution:** SOLID/Testability violations take precedence over performance/architecture optimizations unless clear, documented trade-offs exist.

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
| # | Title | Severity | Impact | Effort | Confidence | Priority | Why it matters |
|—|-——|-———|———|———|————|-———|-—————|
| 1 | …     | High     | 5      | 2      | 4          | 10.0     | …              |

## SOLID Assessment
### S — Single Responsibility
- Problem: …
- Evidence: …
- Why it matters: …
- Actionable Recommendation: …

### O — Open/Closed
…

### L — Liskov Substitution
…

### I — Interface Segregation
…

### D — Dependency Inversion
…

## Testability
- Problem: …
- Evidence: …
- Why it matters: …
- Actionable Recommendation: …

## Cross-Guideline Findings
### Architecture & Boundaries
…

### Cohesion & Coupling
…

### Pattern Opportunities
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
- **Severity (High/Med/Low)** — calibrated across all reviews.
- **Impact (1–5)**
- **Effort (1–5)**
- **Confidence (1–5)**
- **Priority Score = (Impact / Effort) * Confidence** (show calculation inline).
- **Problem → Evidence → Why it matters → Actionable Recommendation (testable/verifiable)**

## 5. Heuristics
- SRP violations = class mixing IO + business + orchestration; also flag *god objects*, `Utils`, and `Manager` classes.
- Open/Closed = variants should add, not edit.
- LSP = subtypes must honor contracts.
- ISP = clients should not depend on unused methods.
- DIP = depend on abstractions, not concretes; external libraries/frameworks should be wrapped behind abstractions.
- Prefer composition, immutability, narrow APIs, and seams for testing.
- **Testability:** Blockers include static dependencies, hidden state, side effects without seams, tight coupling to frameworks. Always prescribe isolation points (interfaces, dependency injection, factories, test doubles).

## 6. Pattern Guidance
Recommend patterns **only when concretely beneficial**:
- Strategy vs. switch
- State vs. flags
- Decorator vs. inheritance
- Adapter for external API mismatch
- Facade for complex subsystem
- Composite for trees
- Builder for telescoping constructors
- Repository for persistence
- Observer for event-driven updates

**Do not recommend patterns** if added complexity outweighs benefits (e.g., small codebases).

## 7. Definition of Done
- All five SOLID principles addressed.
- **Testability explicitly assessed and improved where necessary.**
- Top Risks table completed, ordered, and each entry includes **Why it matters**.
- Every finding includes evidence + why + recommendation + priority.
- Blocked areas clearly listed with required evidence noted.
- Priority Scores explicitly justified (calculation shown).
- No speculative claims; no code samples.
- **Reviewer Checklist:**
  - [ ] SOLID fully covered
  - [ ] Testability fully covered
  - [ ] Top Risks table complete
  - [ ] Each finding testable/verifiable
  - [ ] Evidence traceable (file + line numbers)
  - [ ] Blocked areas documented
  - [ ] Priority scoring explained