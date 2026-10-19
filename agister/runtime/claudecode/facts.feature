# runtime/claudecode, the claude-code wrapper
# (docs/settings-implementation.md, "The composition"; ADR-003, rule 7):
# its contract and what it can do, in its own types, before it runs any
# program.

Feature: The claude-code wrapper gives its facts

  Scenario: Its facts
    When the claude-code wrapper gives its facts
    Then its contract is "claude-code/3"
    And it can check output against a schema, resume a session, take
      skills, take a model, report tool calls and tool commands, and
      keep a cost limit
    And it accepts the efforts "low medium high xhigh max"
    And it takes a call's inputs in its message
