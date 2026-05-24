---
name: state-machine-impl-dod
author: Igor Malyarov
version: "0.1.1"
description: Definition-of-done checklist for state machine implementations verified against an executable-spec seed test list
trigger: when verifying that a state machine implementation is complete and ready to ship
---

# State Machine Implementation DoD

The seed test list path is: $ARGUMENTS

If `$ARGUMENTS` is empty, infer the seed test list from the conversation context. If no seed test list is identifiable, ask the user for its path.

The task is done when the state machine is implemented and verified against the executable-spec seed tests at the seed test list path.

## Completion checklist

- State machine code follows established repository guidelines for state machines.
- State machine tests follow established repository guidelines for state-machine tests.
- Code and tests match existing state-machine style, naming, file organization, helpers, and formatting.
- All executable-spec seed tests from the seed test list are implemented.
- Test names follow the project convention: `test_<action>_should<Assert>_on<Setup>`.
- Each test body delivers exactly what its name promises: the setup matches `<Setup>`, the action matches `<action>`, and the assertion matches `<Assert>` — no extra setup, action, or assertion, and nothing in the name unfulfilled by the body.
- Each test asserts one behavior only.
- Each transition is tested in pairs:
  - one test asserts the resulting state
  - one test asserts the emitted effect or explicit no-effect result
- Invalid or unsupported `state + event` combinations listed in the seed test list follow the repository's established handling pattern.
- All new tests pass.
- All tests in the affected test target pass.
- The diff is limited to files required for the state machine, its tests, and necessary wiring.
- No unrelated refactoring, renaming, formatting, architectural cleanup, or behavior change is included.
