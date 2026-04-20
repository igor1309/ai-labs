---
name: strict-tdd
version: "1.0.0"
description: Strict TDD mode — RED/GREEN/REFACTOR discipline with no-junk scope lock
trigger: when the user explicitly asks for TDD, RED/GREEN, or equivalent
---

# Strict TDD Mode

Trigger strict TDD mode when the user explicitly asks for TDD, RED/GREEN, or equivalent.

- One test at a time.
- RED first: add or update one test, run tests, and get a failing assertion for the missing behavior.
- Compilation errors are not RED.
- During RED, production code changes are forbidden.
- Stop after RED and wait for explicit user approval to continue to GREEN, unless the user explicitly asks to auto-continue.
- GREEN means minimum production code only for the current failing test.
- Do not add extra behavior, scaffolding, defaults, or refactors in GREEN unless required by the failing test.
- Run tests via the changed unit's native test command.

## No-Junk Scope Lock

Do not add anything not required by current scope or the current failing test.

- No new modules or packages unless explicitly requested.
- No default or fallback dependencies unless explicitly requested.
- No placeholder behavior that is not demanded by tests.
- No side docs or log updates for micro-steps.
- If a change does not directly turn current RED into GREEN, do not add it.
