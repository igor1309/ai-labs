---
date: 2026-05-18
model: gpt-5.5-thinking
title: State Machine Executable Spec DoD
tag: DoD, StateMachine, ExecutableSpec
version: 0.0.1
---

# State Machine Executable Spec DoD

The executable-spec seed test list is done when it is ready for implementation handoff.

Completion requires:

- Test names follow `test_<action>_should<Assert>_on<Setup>`.
- Events use domain terms, not UI idioms.
- Each test asserts one behavior only.
- Each transition is represented by paired tests:
  - resulting state
  - emitted effect or explicit no-effect result
- The list covers all required `state + event` transitions.
- An explicit state × event coverage matrix is included, with each cell marked as covered, invalid, or unsupported, and every covered cell mapped to its paired tests.
- Invalid or unsupported `state + event` combinations are covered where required by repo state-machine patterns.
- Test names are specific enough to reveal expected behavior without opening the implementation.
- No implementation details, model-shape decisions, or UI mechanics are encoded in the test names.
- There are no open questions affecting states, events, transitions, effects, or invalid/unsupported behavior.
