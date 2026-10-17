# runtime/pi, the pi wrapper (docs/settings-implementation.md, "The
# composition"; ADR-003, rule 7): its contract and what it can do, in its
# own types, before it runs any program.

Feature: The pi wrapper gives its facts

  Scenario: Its facts
    When the pi wrapper gives its facts
    Then its contract is "pi/1"
    And it can check output against a schema, resume a session, take
      skills, take a model, and report tool calls and tool commands
    And it accepts the efforts "off minimal low medium high xhigh max"
    And it takes a call's inputs in its message
