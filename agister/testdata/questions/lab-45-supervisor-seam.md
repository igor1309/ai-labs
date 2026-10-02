# LAB-45: does the OpenCode adapter need its own process seam?

Review run 20261001T232126Z-6bde75 ruled this item for the owner.

Finding (major): OpenCode Runner binds process execution directly to the concrete supervisor

Question: Question for the owner: do runtime adapters have to inject their process transport under ADR-001 rule 13? Options: (a) add an OpenCode-owned process collaborator now, wire it at the composition root, and leave the sibling adapters inconsistent; (b) treat the shared supervisor package as an allowed direct dependency of runtime adapters and record that in the ADR; (c) accept the rule and plan a separate change that converts every runtime adapter at once.

Judge's reasoning: The evidence holds as far as it goes. ADR-001 rule 13 (lines 245 and 252) requires each component to declare its own dependency interfaces, recursively. Runner calls supervisor.Version and supervisor.Run directly, and main.go:152 passes it only a command. However, the reviewer says the new adapter 'extends the same direct-binding pattern used by the sibling adapters', so this is an existing project-wide pattern, not a defect unique to this change. The reviewer also shows no behaviour that the fake-binary subprocess tests cannot make fail; the gap is architectural conformance, not a missing seam. Changing OpenCode alone would make it differ from its siblings, and changing them all goes beyond this issue.

Answer with one of (a), (b), (c) and why, or "owner" if this needs the
owner's decision.
