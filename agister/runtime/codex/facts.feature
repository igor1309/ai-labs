# runtime/codex, the codex wrapper (docs/settings-implementation.md, "The
# composition"; ADR-003, rule 7): its contract and what it can do, in its
# own types, before it runs any program.

Feature: The codex wrapper gives its facts

  Scenario: Its facts
    When the codex wrapper gives its facts
    Then its contract is "codex/2"
    And it can check output against a schema, resume a session, take
      skills, take a model, and report tool calls and tool commands
    And it cannot take a budget
    And it accepts the efforts "minimal low medium high xhigh"
    And it takes a call's inputs in its message
