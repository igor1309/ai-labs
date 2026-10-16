# The runtime wrappers, runtime/<name> (docs/settings-implementation.md,
# "The composition"; ADR-003, rule 7): each gives its contract and what
# it can do, in its own types, before it runs any program.

Feature: Each runtime wrapper gives its facts

  Scenario Outline: A wrapper's facts
    When the wrapper <wrapper> gives its facts
    Then its contract is "<contract>"
    And it <can> check output against a schema, resume a session, take
      skills, take a model, and report tool calls and tool commands
    And it accepts the efforts "<efforts>"

    Examples:
      | wrapper     | contract      | can    | efforts                               |
      | claude-code | claude-code/3 | can    | low medium high xhigh max             |
      | codex       | codex/2       | can    | minimal low medium high xhigh         |
      | pi          | pi/1          | can    | off minimal low medium high xhigh max |
      | bash        | bash/1        | cannot |                                       |
