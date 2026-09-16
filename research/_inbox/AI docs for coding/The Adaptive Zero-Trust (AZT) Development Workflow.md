# The Adaptive Zero-Trust (AZT) Development Workflow

## 1. Guiding Principles

This document outlines a structured framework for professional, AI-assisted software development, built upon two core principles:

1.  **Verifiable Oversight (Zero-Trust):** The workflow operates on a Zero-Trust basis, requiring every AI-generated artifact to be approved by a trusted **Overseer** before it is integrated. In the current technological landscape, this role is filled by an experienced human developer, representing a pragmatic choice for ensuring reliability. This structure allows for a future transition to a trustworthy AI overseer without altering the workflow's core logic.

2.  **Adaptive Planning:** The workflow is a **controlled spiral**, not a rigid waterfall. It provides a formal mechanism for the plan to adapt to design insights discovered during implementation, preventing the enforcement of a suboptimal architecture.

## 2. The Four-Phase Workflow

The workflow proceeds through four distinct phases. The first three operate as collaborative **Workshops** to define the problem and the contract. The final phase shifts to an automated loop for implementation.

### Phase 1: Specification Workshop
This phase uses the **Workshop Model**: a collaborative, conversational process where the Overseer and AI refine requirements through an iterative dialogue.

*   **Goal:** To collaboratively produce `spec.md` document detailing user stories and acceptance criteria.
*   **Approval:** The workshop concludes upon formal approval from the **Overseer**, which locks in the artifact.

### Phase 2: Architectural Plan Workshop
Following the same Workshop Model, this phase translates the feature specification into a concrete and actionable technical design. This is the critical architectural step where the "how" is determined.

*   **Goal:** To produce an approved `plan.md` document. This artifact is a **detailed, step-by-step implementation plan** that outlines the files to be created or modified, the function signatures or API contracts to be implemented, and the overall technical approach.
*   **Approval:** The workshop concludes upon formal approval from the **Overseer**. This locks in the architectural blueprint for the subsequent phases.

### Phase 3: Executable Specification Workshop
This phase uses the Workshop Model to translate the detailed technical plan into a formal, executable contract in the form of failing tests.

*   **Goal:** To produce approved test files.
*   **Approval:** The workshop concludes upon formal approval from the **Overseer**.
*   **Final Check:** Before approval, an automated run must confirm the new tests **fail** as expected.

### Phase 4: The RGRF (Red-Green-Refactor-Flag) Loop
This phase shifts to the more automated **RGRF Loop**, extending the classic TDD cycle to account for architectural discovery.

*   **Goal:** To write clean, efficient, and correct production code that fulfills the contract defined in Phase 3.
*   **Process:**
    1.  **RED:** The loop begins with a specific, failing test.
    2.  **GREEN:** The AI writes the simplest code to make the test pass (verified automatically).
    3.  **REFACTOR:** The AI improves the new code's internal structure while ensuring tests still pass. This stage has two outcomes:
        *   **A) Local Refactoring:** The improvements are consistent with the plan. The loop proceeds to the next RED test.
        *   **B) Design Discovery (Flag):** The AI identifies a conflict with the master plan. The loop **halts**, and the AI raises a **Design Discovery Flag** by producing a report for the Overseer.
    4.  **FLAG (Overseer Decision):** The Overseer reviews the Flag report and makes a strategic decision: **Accept** the discovery (re-opening the Plan Workshop), **Reject** it, or **Discuss** it further.