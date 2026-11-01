# runtime/codex, the tool calls a turn reports (docs/run-implementation.md,
# "Inputs and progress", "Recovery"): best effort, read from its JSON events
# as the lines come. A spy answers in place of the supervisor, fed recorded
# lines (ADR-009, rule 3).

Feature: The codex wrapper reports the tool calls it recognizes

  Scenario: Commands and searches are reported, messages are not
    Given the supervisor's lines: a command_execution "go test" started,
      an agent_message, a web_search of the query "q" completed, then
      turn.completed
    When codex runs a turn
    Then it reports a call naming "go test", then one naming "q", and
      nothing for the message
    And its reply is as before

  Scenario: Every other line is reported as a line
    Given the supervisor's lines: thread.started, a reasoning item, then
      turn.completed
    When codex runs a turn
    Then it reports three lines and no tool call

  Scenario: A command is reported whole
    Given the supervisor's lines: a command_execution of 500 bytes
      started, then turn.completed
    When codex runs a turn
    Then it reports a call naming the command with all 500 bytes

  Scenario: A tool item's completion reports a tool's result
    Given the supervisor's lines: a command_execution "go test" started,
      then completed, an agent_message completed, a web_search with no
      query started, then completed with the query "q", then
      turn.completed
    When codex runs a turn
    Then it reports a call naming "go test", a tool's result, a line, a
      line, a call naming "q", a tool's result, and a line
