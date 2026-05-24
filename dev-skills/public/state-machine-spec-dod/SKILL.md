---
name: state-machine-spec-dod
author: Igor Malyarov
version: "0.2.0"
description: Definition-of-done checklist for the state machine executable-spec seed test list before implementation handoff
trigger: when verifying that a state machine executable-spec seed test list is ready for implementation
---

# State Machine Executable Spec DoD

The executable-spec seed test list is done when it is ready for implementation handoff.

## Completion checklist

- Test names follow `test_<action>_should<Assert>_on<Setup>`.
- Events use domain terms, not UI idioms.
- Each test asserts one behavior only.
- The state × event matrix is the source of truth: each cell is marked invalid, unsupported, or covered; covered cells specify the resulting state and the emitted effect (or explicit no-effect).
- The seed test list is a mechanical projection of the matrix: each covered cell produces paired tests — one for the resulting state, one for the emitted effect or explicit no-effect result.
- For each event, the matrix specifies the repeated-event policy (same event arriving again in the same state). Seed tests are added only where the policy is non-trivial; obvious no-ops are not rote-tested.
- Dependencies are specified as part of the executable spec: synchronous reducer dependencies and asynchronous effect-handler dependencies are listed with payload, result, and required spy assertions.
- Dependency seed tests verify no dependency calls on initialization.
- Synchronous reducer dependencies are tested with reducer spies: verify no calls on no-op paths, verify the exact payload for each call, and verify the spy stub value is used by the reducer.
- Asynchronous effect-handler dependencies are tested with effect-handler spies: verify no calls before the effect is handled, verify the exact payload for each call, and verify the spy stub value is dispatched or observed as the effect-handler result.
- For dependencies with `Void` payload, verify call count instead of payload equality.
- Invalid or unsupported `state + event` combinations are covered where required by repo state-machine patterns.
- Test names are specific enough to reveal expected behavior without opening the implementation.
- No implementation details, model-shape decisions, or UI mechanics are encoded in the test names.
- There are no open questions affecting states, events, transitions, effects, or invalid/unsupported behavior.
