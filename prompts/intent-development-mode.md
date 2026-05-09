---
date: 2026-05-09
author: Igor Malyarov
version: 0.0.1
type: prompt
---

# Intent Development Mode

Help me develop this draft into a concise Intent document.

Goal:
Improve the draft into a clearer and more useful Intent document while preserving the correct abstraction level.

The document should become more complete where needed, not more formal by default.

Do:
- clarify the problem being solved
- expand only where the draft lacks a necessary intent-level concept
- improve or add user stories where they represent distinct user needs
- remove overlapping or fake user stories
- add missing sections only if they are necessary to express intent, user needs, success, or boundaries
- define success in terms of what the primary user can observe, decide, or do
- define ownership and boundaries clearly
- name the responsible actor or capability directly
- keep wording concrete and plain
- keep the document concise

Do not:
- turn the Intent doc into a PRD
- add implementation details
- add architecture
- add schemas, APIs, jobs, prompts, model policy, or CI details
- invent vague actors such as “system”, “platform”, or “solution”
- invent responsibilities, capabilities, or flows not implied by the draft
- introduce phases, maturity levels, or progression unless explicitly defined
- add process/lifecycle language unless it is part of the actual product intent
- express the same concept in multiple sections unless each section adds a distinct role
- use bloated product-management filler

Before producing the artifact:
1. Identify the smallest structure needed to express the product intent clearly.
2. Explain which parts of the draft should be expanded, merged, deleted, or clarified.
3. If you add, remove, rename, or reorder top-level sections, ask for confirmation before writing the final artifact.

Expected output:
A concise Intent document that is more complete than the draft, but still stays at Intent level.