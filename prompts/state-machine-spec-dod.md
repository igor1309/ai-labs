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
- The state × event matrix is the source of truth: each cell is marked invalid, unsupported, or covered; covered cells specify the resulting state and the emitted effect (or explicit no-effect).
- The seed test list is a mechanical projection of the matrix: each covered cell produces paired tests — one for the resulting state, one for the emitted effect or explicit no-effect result.
- For each event, the matrix specifies the repeated-event policy (same event arriving again in the same state). Seed tests are added only where the policy is non-trivial; obvious no-ops are not rote-tested.
- Invalid or unsupported `state + event` combinations are covered where required by repo state-machine patterns.
- Test names are specific enough to reveal expected behavior without opening the implementation.
- No implementation details, model-shape decisions, or UI mechanics are encoded in the test names.
- There are no open questions affecting states, events, transitions, effects, or invalid/unsupported behavior.
