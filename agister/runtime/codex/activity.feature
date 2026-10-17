# runtime/codex, the tool calls a turn reports (docs/run-implementation.md,
# "Inputs and progress"): read from its JSON events as the lines come. A
# spy answers in place of the supervisor, fed recorded lines (ADR-009,
# rule 3).

Feature: The codex wrapper reports each tool call as it reads it

  Scenario Outline: An item is reported as its kind gives it
    Given the supervisor's lines: <event> of <item>, then
      turn.completed
    When codex runs a turn
    Then it reports <report>

    Examples:
      | event          | item                                         | report                  |
      | item.started   | a command_execution of the command "go test" | "shell" with "go test"  |
      | item.started   | a file_change of the paths "a.go" and "b.go" | "edit" with "a.go b.go" |
      | item.started   | an mcp_tool_call of "t" on "s" given {"x":1} | "mcp:s/t" with {"x":1}  |
      | item.completed | a web_search of the query "q"                | "search" with "q"       |
      | item.started   | a web_search of no query                     | nothing                 |
      | item.completed | a command_execution of the command "go test" | nothing                 |
      | item.started   | an agent_message                             | nothing                 |
      | item.started   | a reasoning                                  | nothing                 |

  Scenario: A turn's items are reported in the order they start
    Given the supervisor's lines: item.started of the commands "a", then
      "b", then turn.completed
    When codex runs a turn
    Then it reports "shell" with "a", then "shell" with "b", and its
      reply is as before
