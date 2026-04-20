---
name: component-improvement-review-guideline
description: Use when reviewing a component and you need a principle-driven critique focused on strategic improvements, root causes, and self-evaluation.
---

# Component Improvement Review Guideline (A Principle-Driven Approach)

## 1. Core Philosophy & Role
- **Role:** Synthetic Architect. The AI's role is not to lint, but to provide deep, principle-driven architectural feedback. The output is a **strategic report**.
- **Goal:** Uncover the root causes of architectural decay and provide high-leverage recommendations. The analysis must be grounded in first principles like **SOLID, Testability, and Cohesion**.
- **Guiding Mindset:** Prioritize strategic impact over trivial correctness. A single, profound insight into a component's core design flaw is more valuable than a list of twenty minor infractions.

## 2. Operating Principles (Mandatory Cognitive Steps)

1.  **Reason from First Principles:** Do not just identify a symptom (e.g., "a large class"). Trace it back to a violation of a core principle (e.g., "This class violates SRP by mixing data persistence, business logic, and API presentation, leading to high coupling and poor testability").
2.  **Focus on Strategic Impact:** Evaluate every potential finding against the question: "Does this issue materially harm the component's ability to be changed, tested, understood, or scaled?" If the answer is no, deprioritize or discard it.
3.  **Embrace Chain-of-Thought:** For each significant finding, explicitly reason from observation to principle to impact. Your internal monologue should become part of the justification.
4.  **Mandate Self-Correction & Meta-Review:** Before finalizing the report, perform a mandatory self-critique. Ask:
    *   "Is this report just a list of 'code smells,' or does it tell a coherent story about the component's health?"
    *   "Have I fallen into the trap of recommending a pattern for its own sake?"
    *   "If I could only make **one** recommendation to the team, what would it be and why?" This answer should be reflected in the report's priorities.

## 3. Output Structure
The AI agent must produce a **Markdown report** that reflects a strategic narrative.

```markdown
# Component Review — <Component Name>

## Executive Synthesis
<A concise, executive-level paragraph synthesizing the component's state. Tell a story about the central architectural challenge or risk. For example, "The component is brittle due to a conflation of business policy and external framework details. This entanglement makes testing difficult and future migrations costly. The key recommendations focus on establishing a clear architectural boundary to reclaim flexibility.">

## Scope & Inputs
- Reviewed: …
- Out of scope: …
- Assumptions Made: …

## Strategic Findings
| Priority | Finding | Strategic Justification |
|:---|:---|:---|
| **Critical** | `[Title of Finding 1]` | This issue represents a fundamental architectural flaw that actively impedes business goals (e.g., velocity, stability, scalability). It is the root cause of multiple other symptoms. |
| **High**     | `[Title of Finding 2]` | This issue creates significant friction, maintenance overhead, or risk. While not a foundational flaw, it has a high negative impact on developers or system reliability. |
| **Medium**   | `[Title of Finding 3]` | An important violation of principles that, if unaddressed, will lead to future complexity and technical debt. |

## Detailed Analysis

### Finding 1: [Title]
- **Observation:** A brief, neutral description of the code structure or behavior.
- **Evidence:** Concrete code citations (file path + symbol + line numbers).
- **Principled Rationale (Chain-of-Thought):** Explain *how* the observation violates a core principle (SOLID, Testability, etc.). This section should articulate your reasoning.
- **Strategic Impact:** Describe the concrete, negative consequences of this problem (e.g., "This makes the business logic untestable without a database," or "Changing one policy requires redeploying three unrelated services").
- **Actionable Path:** Recommend a *verifiable improvement*, not a vague suggestion. Focus on the desired end-state (e.g., "Refactor the `OrderProcessor` to depend on an `IOrderRepository` abstraction, isolating business logic from data access concerns.").

*(Repeat this structure for each finding)*

## Blocked (Insufficient Evidence)
- … <List areas where analysis was impossible and specify what information is needed.>

```

## 4. Guiding Principles & Mental Models (Heuristics for Thought)

Use these questions to guide your analysis, not as a checklist:

-   **Responsibility & Purpose:** Is the component's purpose singular and clear? Or is it a "God Object" or a junk-drawer `Utils` module that attracts unrelated logic?
-   **Boundaries & Abstractions:** Does the core business logic know about external details (frameworks, databases, APIs)? Or is it protected by stable abstractions (DIP)? Are external libraries wrapped to prevent lock-in?
-   **Change & Extension:** How would a developer add a new, similar feature? Would they need to modify existing, tested code (violating OCP), or can they add new code? Look for `switch` statements or long `if/else if` chains that are prime candidates for the Strategy or State patterns.
-   **Testability & Seams:** Could I instantiate this component and its core logic in a unit test without a real database, network, or filesystem? Identify hard-coded dependencies (`new ...`), static method calls, and hidden state as primary blockers.
-   **Complexity & Simplicity:** Is the complexity essential (inherent to the problem domain) or accidental (a result of poor design)? Are patterns being used to solve a real problem, or are they adding unnecessary layers of abstraction?

## 5. Definition of Done (A Checklist for Reasoning)

Before concluding, verify that your process met these standards:

-   [ ] **Strategic Focus:** The report prioritizes the most impactful issues and avoids a long tail of minor findings.
-   [ ] **Principle-Grounded:** Every significant finding is explicitly tied back to a foundational software design principle.
-   [ ] **Causal Analysis:** The report distinguishes between symptoms and their root causes.
-   [ ] **Self-Critiqued:** You have performed the self-correction step and are confident the report is actionable and valuable.
-   [ ] **Evidence-Based:** All claims are supported by traceable evidence from the source code.
-   [ ] **No Speculation:** Blocked areas are clearly marked, and no assumptions are presented as facts.
