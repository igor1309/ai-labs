---
date: 2025-10-08
description: Top-Level Non-Linear Agentic Coding Flow
Model: gpt-5
---

# Agentic Dev Flow

_A cyclic, self-correcting loop from intent to insight._

## 1. **Intake**
**Capture:** Task, bug report, feature request, or observation.  
**Goal:** Identify *what triggered action* — the external signal activating the agent.  
**Output:** Structured problem statement (who/what/why).

---

## 2. **Spec**
**Define:** Articulate *intent* and *constraints*.  
Think of this as the **genotype** — the minimal DNA of the solution.  
**Question:** What *must* exist before deciding *how* to make it exist?

---

## 3. **Executable Spec**
**Concretize:** Turn intent into a form that can be **executed, simulated, or tested** — by human or system alike.  
It bridges abstract design and concrete implementation through:
- Behavior contracts  
- Expected I/O examples  
- Acceptance criteria as structured tests or scenarios

---

## 4. **Plan**
**Sequence:** Translate executable intent into *orderable, assignable work*.  
May include:
- Task decomposition  
- Dependencies  
- Implementation order  
**Agentic Note:** Planning can refine the Spec; feedback is expected.

---

## 5. **TDD Cycle**
**Verify:** Execute and evolve the spec through iterative testing.  
Each cycle:
1. Write failing test(s) (Red)  
2. Make code compile and pass (Green)  
3. Refactor and reconcile with Spec/Plan (Refine)  
**Agentic Note:** Test outcomes feed corrections back into earlier stages.

---

## 6. **Log**
**Compress:** Record what changed and why it matters.  
- **Short** and **user-facing**  
- Git tracks implementation; **Log tracks impact**

---

## 7. **Artifact**
**Preserve:** Consolidate durable knowledge.  
Includes:
- Design decisions and rationale  
- Architectural outlines  
- Postmortems and context for future agents

---

## 🔄 Non-linear Aspect
This flow is *non-sequential*:  
- **Spec ↔ Executable Spec** evolve in tandem.  
- **TDD ↔ Spec/Plan** continuously refine each other.  
- **Log & Artifact** mirror reasoning, not endpoints.  
Agentic systems loop back automatically when inconsistency or uncertainty arises.