# runtime/codex, the tool calls a turn reports (docs/run-implementation.md,
# "Inputs and progress"): read from its JSON events as the lines come. A
# spy answers in place of the supervisor, fed recorded lines (ADR-009,
# rule 3).

Feature: The codex wrapper reports each item it starts

  Scenario Outline: An item started is reported as its kind gives it
    Given the supervisor's lines: item.started of <item>, then
      turn.completed
    When codex runs a turn
    Then it reports <report>

    Examples:
      | item                                           | report                  |
      | a command_execution of the command "go test"   | "shell" with "go test"  |
      | a file_change of the paths "a.go" and "b.go"   | "edit" with "a.go b.go" |
      | an mcp_tool_call of the tool "t" given {"x":1} | "t" with {"x":1}        |
      | a web_search of the query "q"                  | "search" with "q"       |
      | an agent_message                               | nothing                 |
      | a reasoning                                    | nothing                 |

  Scenario: A turn's items are reported in the order they start
    Given the supervisor's lines: item.started of the commands "a", then
      "b", then turn.completed
    When codex runs a turn
    Then it reports "shell" with "a", then "shell" with "b", and its
      reply is as before
