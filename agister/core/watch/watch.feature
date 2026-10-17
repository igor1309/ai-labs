# core/watch (docs/run-implementation.md, "A step in a held worktree";
# ADR-006, rule 1): a turn's staleness, observed over what its wrapper
# reports, best effort. A clock spy and a timer spy keep its time
# (ADR-009, rule 5).

Feature: A turn is watched for staleness

  Scenario Outline: A limit reached reports the turn stale
    Given the limits <limits>
    When the turn reports <reports>
    Then the watch reports <stale>

    Examples:
      | limits                | reports                                                    | stale                                 |
      | repeated_tool_calls 3 | "Bash" with "ls" three times in a row                      | the tool call "Bash" repeated 3 times |
      | repeated_tool_calls 3 | "Bash" with "ls", "Bash" with "pwd", then "Bash" with "ls" | nothing                               |
      | tool_command 15m      | "Bash" with "go test", then nothing for 15m                | the tool command "Bash" ran over 15m  |
      | tool_command 15m      | "Bash", then a line within 15m, then nothing               | nothing                               |
      | no_event 21m          | a line, then nothing for 21m                               | no event for 21m                      |
      | repeated_tool_calls 3 | "Bash" with "ls", a line, three times                      | the tool call "Bash" repeated 3 times |
      | repeated_tool_calls 3 | "Write" thrice, inputs alike in their first 300 bytes only | nothing                               |
      | none                  | nothing for 1h                                             | nothing                               |

  Scenario: Each report restarts the quiet limits
    Given the limit no_event 21m
    When the turn reports a line every 20m for an hour
    Then the watch reports nothing
