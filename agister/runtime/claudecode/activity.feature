# runtime/claudecode, the tool calls a turn reports
# (docs/run-implementation.md, "Inputs and progress", "Recovery"): read from
# stream-json as the lines come. A spy answers in place of the supervisor,
# fed recorded lines (ADR-009, rule 3).

Feature: The claude-code wrapper reports each tool call as it reads it

  Scenario: Each tool_use block is reported, its name and its input
    Given the supervisor's lines: an assistant event of the text "x"
      and the tool_use "Bash" given {"command":"ls"}, then one of the
      tool_use "Read" given {"file_path":"a.go"}, then a result
    When claude-code runs a turn
    Then it reports "Bash" with {"command":"ls"}, then "Read" with
      {"file_path":"a.go"}, each before the next line is read
    And its reply is as before

  Scenario: A turn with no tool call reports nothing
    Given the supervisor's lines: an assistant event of the text "x",
      then a result
    When claude-code runs a turn
    Then it reports nothing

  Scenario: Every other line is reported as a line, a tool call whole
    Given the supervisor's lines: a system event, a tool_use "Write"
      given 500 bytes of JSON, a user event, then a result
    When claude-code runs a turn
    Then it reports a line, the tool call "Write" with all 500 bytes, a
      line, and a line

  Scenario: A user event carrying a tool_result reports a tool's result
    Given the supervisor's lines: a tool_use "Bash" given
      {"command":"ls"}, a rate_limit_event, a user event carrying a
      tool_result, then a result
    When claude-code runs a turn
    Then it reports the tool call "Bash", a line, a tool's result, and
      a line
