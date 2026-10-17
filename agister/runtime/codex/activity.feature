# runtime/codex, the tool calls a turn reports (docs/run-implementation.md,
# "Inputs and progress"): best effort, read from its JSON events as the
# lines come. A spy answers in place of the supervisor, fed recorded lines
# (ADR-009, rule 3).

Feature: The codex wrapper reports the tool calls it recognizes

  Scenario: Commands and searches are reported, messages are not
    Given the supervisor's lines: a command_execution "go test" started,
      an agent_message, a web_search of the query "q" completed, then
      turn.completed
    When codex runs a turn
    Then it reports a call naming "go test", then one naming "q", and
      nothing for the message
    And its reply is as before
