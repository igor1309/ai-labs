---
name: spec-writing
author: Igor Malyarov
version: "1.0.0"
description: Spec structure, required sections, and constraints for defining component contracts before implementation
trigger: when creating, reviewing, or working with specs
---

# Specs

Specs define a component's contract before implementation. They live at `<project>/docs/specs/<name>.md` and move to `<project>/docs/specs/implemented/` after implementation.

Required sections:
- **Goal**: one sentence — what the component does and who owns it.
- **Public interface**: function signatures, input/output shapes.
- **Behavior rules**: validation, error handling, edge cases — concrete and testable.
- **Tests (required)**: enumerated test cases that cover the behavior rules.
- **Done criteria**: what "finished" means — typically interface + tests.

Specs must not contain architecture preamble, future speculation, or implementation details. They describe *what* and *when it fails*, not *how*.
