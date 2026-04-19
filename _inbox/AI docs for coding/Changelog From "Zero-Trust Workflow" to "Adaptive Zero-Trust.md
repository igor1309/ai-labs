### Changelog: From "Zero-Trust Workflow" to "Adaptive Zero-Trust (AZT)"

Here are the key upgrades we made together, moving from the initial rigid model to the final adaptive one.

**1. Renamed "Approval Gate" to "Workshop Model" for Phases 1-3.**
*   **Reason:** You correctly pointed out that my initial "command -> generate -> approve" model was too simplistic and didn't allow for the necessary back-and-forth dialogue to refine ideas.
*   **Impact:** This changed the core interaction from a rigid transaction to a collaborative, iterative conversation for all non-implementation phases.

**2. Upgraded Phase 4 from a Simple "Loop" to a "Red-Green-Refactor Loop".**
*   **Reason:** You identified a critical flaw in my model: a goal to simply "make the tests pass" encourages technical debt. You insisted on including the **Refactor** step.
*   **Impact:** This ensures that the workflow produces not just *working* code, but *high-quality, maintainable* code, making the process a forcing function for good engineering practices.

**3. Introduced the "Design Discovery Flag" Mechanism.**
*   **Reason:** This was your most profound insight. You noted that TDD is a discovery process and a rigid upfront plan can be harmful. We needed a way for discoveries made during implementation to feed back into the architecture.
*   **Impact:** This is the feature that makes the workflow truly **Adaptive**. It creates a formal, safe way to pause the implementation, question the plan, and allow the human to make a strategic decision to re-architect based on new information. It turns a linear waterfall into a controlled spiral.

**4. Renamed the Document to "Adaptive Zero-Trust (AZT)".**
*   **Reason:** The original title no longer captured the essence of the workflow. The "Design Discovery Flag" made it more than just about "Trust"; it's about the ability to **Adapt**.
*   **Impact:** The name and philosophy section were updated to reflect this more sophisticated, realistic understanding of software development.