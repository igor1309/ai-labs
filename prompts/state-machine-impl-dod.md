---
date: 2026-05-18
model: gpt-5.5-thinking
title: State Machine Implementation DoD
tag: DoD, StateMachine
version: 0.1.0
params:
  SEED_TEST_LIST: path to the executable-spec seed test list
---

# State Machine Implementation DoD

The task is done when the State Machine is implemented and verified against the executable-spec seed tests listed in `{{SEED_TEST_LIST}}`.

Completion requires:

- State machine code follows established repository guidelines for state machines.
- State machine tests follow established repository guidelines for state-machine tests.
- Code and tests match existing state-machine style, naming, file organization, helpers, and formatting.
- All executable-spec seed tests from `{{SEED_TEST_LIST}}` are implemented.
- Test names follow the project convention: `test_<action>_should<Assert>_on<Setup>`.
- Each test body delivers exactly what its name promises: the setup matches `<Setup>`, the action matches `<action>`, and the assertion matches `<Assert>` — no extra setup, action, or assertion, and nothing in the name unfulfilled by the body.
- Each test asserts one behavior only.
- Each transition is tested in pairs:
  - one test asserts the resulting state
  - one test asserts the emitted effect or explicit no-effect result
- Invalid or unsupported `state + event` combinations listed in `{{SEED_TEST_LIST}}` follow the repository's established handling pattern.
- All new tests pass.
- All tests in the affected test target pass.
- The diff is limited to files required for the state machine, its tests, and necessary wiring.
- No unrelated refactoring, renaming, formatting, architectural cleanup, or behavior change is included.
