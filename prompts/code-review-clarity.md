---
date: 2026-09-23
author: Igor Malyarov
model: gpt-6
name: Code review — clarity
version: 0.0.1
type: prompt
---

Review code for clarity, readability, and simplicity for both humans and coding agents. Prefer straightforward structure over cleverness or unnecessary abstraction. Leave already-clear code alone.

Definition of done:

* Intent is obvious from naming and structure.
* Control flow is linear and shallow where practical.
* Files, types, objects, and functions have focused responsibilities and remain easy to reason about.
* Long parameter lists are replaced with meaningful grouped data where appropriate.
* Comments explain why, constraints, or tradeoffs—not what the code already says.
* Abstractions are earned: abstract shared meaning, not merely similar shape.
* Deduplication does not introduce coupling between concepts that may evolve independently.
* Indirection is minimized; boundaries exist because they clarify responsibility.
* A change does not edit a recorded decision (an ADR, a design specification, a prompt, AGENTS.md or another agent instruction). Such an edit is a finding however accurate it is: decisions are the owner's, and code that departs from one is reported, not reconciled by rewriting the record. Quote the edit.
* Stop once the code is clear.
