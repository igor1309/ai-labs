# runtime/bash, the bash wrapper (docs/settings-implementation.md, "The
# composition"; ADR-003, rule 7): its contract and what it can do, in its
# own types, before it runs any program.

Feature: The bash wrapper gives its facts

  Scenario: Its facts
    When the bash wrapper gives its facts
    Then its contract is "bash/1"
    And it cannot check output against a schema, resume a session, take
      skills, take a model, report tool calls and tool commands, or
      keep a cost limit
    And it accepts no effort
    And it takes a call's inputs in its program's environment
