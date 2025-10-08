---
date: 2025-10-08
description: Top-Level Non-Linear Agentic Coding Flow
---

# Agentic Dev Flow

## 1. **Intake**
**Source:** Task, bug report, feature request, or observation.  
**Goal:** Establish *what prompted action* — the external signal that activates the agent.  
**Output:** Structured problem statement (who/what/why).

---

## 2. **Spec**
**Purpose:** Articulate *intent* and *constraints*.  
Think of this as defining the **genotype** — the minimal DNA of the solution.  
**Question:** What *must* exist before deciding *how* to make it exist?

---

## 3. **Executable Spec**
**Role:** Bridge between abstract design and concrete implementation.  
It defines what’s *testable* and *verifiable* without yet writing production code.  
Examples:
- Behavior contracts
- Expected I/O examples
- Acceptance criteria as structured tests or mocks

---

## 4. **Plan**
**Purpose:** Translate executable intent into *sequenceable* and *assignable* work.  
May include:
- Task decomposition
- Dependencies
- Implementation order  
**Agentic Note:** Planning may retroactively refine the spec; feedback is expected.

---

## 5. **TDD Cycle**
**Purpose:** Execute and evolve the spec through iterative testing.  
Each cycle:
1. Write failing test(s) (Red)  
2. Make code compile and pass (Green)  
3. Refactor and reconcile with Spec/Plan (Refine)  
**Agentic Note:** The agent uses test outcomes to self-correct the spec or plan.

---

## 6. **Log**
**Purpose:** Source material for release notes.
- **Short** and **user-facing**: what changed and why it matters
- Git tracks implementation; Log tracks impact​​​​​​​​​​​​​​​​
- 
---

## 7. **Artifact**
**Purpose:** Consolidate durable knowledge.  
Includes:
- Design decisions and rationale  
- Architectural outlines  
- Postmortems and valuable context for future agents

---

## 🔄 Non-linear Aspect
This flow is *non-sequential*:  
- **Spec ↔ Executable Spec** evolve in tandem.  
- **TDD ↔ Spec/Plan** continuously refine each other.  
- **Log & Artifact** are cumulative mirrors of reasoning, not endpoints.  
Agentic systems re-enter earlier stages autonomously when inconsistency or uncertainty arises.