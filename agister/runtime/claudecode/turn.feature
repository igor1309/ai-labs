# runtime/claudecode, the claude-code wrapper's turn
# (docs/run-implementation.md, "A step on a model runtime"; ADR-003,
# rule 6): claude -p through the supervisor, its stream-json read. A spy
# answers in place of the supervisor, fed recorded lines (ADR-009, rule 3).

Feature: The claude-code wrapper runs a turn

  Scenario: A turn asks the supervisor for claude, the message on stdin
    When claude-code runs the message "m" in "/r" with goal=g, the
      instruction "i", the model "opus", the effort "high", the options
      "Read" and "Grep", and the schema "{}"
    Then the supervisor is asked to run "claude" in "/r" with goal=g,
      given the text "m", and the arguments "-p", "--output-format",
      "stream-json", "--verbose", "--permission-mode", "dontAsk",
      "--tools=Read,Grep,Skill", "--allowedTools=Read,Grep,Skill",
      "--strict-mcp-config", "--model", "opus", "--effort", "high",
      "--append-system-prompt", "i", "--json-schema", "{}"

  Scenario: What is not given is left out
    When claude-code runs the message "m" with nothing else
    Then the arguments are "-p", "--output-format", "stream-json",
      "--verbose", "--permission-mode", "dontAsk", "--tools=Skill",
      "--allowedTools=Skill", "--strict-mcp-config"

  Scenario: Skill is given once
    When claude-code runs the message "m" with the options "Skill" and
      "Read"
    Then the arguments hold "--tools=Skill,Read" and
      "--allowedTools=Skill,Read"

  Scenario: A successful result is the reply
    Given the lines of an init event of the session "s1", an assistant
      text "thinking", and a success result of the text "done", the
      structured output {"ok":true}, the cost 0.25 and the usage of 10
      input and 3 output tokens
    When claude-code runs a turn
    Then the reply's text is "done", its structured output {"ok":true},
      its session "s1", its cost 0.25, its usage 10 input and 3 output
      tokens, cache read and cache write unknown, and no failure class

  Scenario: A result with no text keeps the last assistant text
    Given the lines of an assistant text "last", and a success result of
      no text
    When claude-code runs a turn
    Then the reply's text is "last"

  Scenario Outline: A failed result is classed by its fields
    Given the lines of <seen>, and a result <result>
    When claude-code runs a turn
    Then the reply's failure class is "<class>", its reason the
      result's errors or text

    Examples:
      | seen                  | result                                                   | class            |
      | an init event         | of api_error_status 429                                  | rate_limited     |
      | a rejected rate limit | error_during_execution                                   | rate_limited     |
      | an init event         | of api_error_status 401                                  | auth             |
      | an init event         | of is_error true and "Not logged in · Please run /login" | auth             |
      | an init event         | of is_error true and "Prompt is too long"                | context_overflow |
      | an init event         | error_max_turns                                          | runtime_error    |

  Scenario: A schema given and no structured output is invalid output
    Given a schema, and the lines of a success result of the text "done"
    When claude-code runs a turn
    Then the reply's failure class is "invalid_output"

  Scenario: A failed result with a schema given is the runtime's failure
    Given a schema, and the lines of a result of api_error_status 401
    When claude-code runs a turn
    Then the reply's failure class is "auth"

  Scenario Outline: With no result, how the program exited decides
    Given the lines of an init event, and the program <exited>
    When claude-code runs a turn
    Then the reply's failure class is "<class>", its reason <reason>

    Examples:
      | exited                         | class         | reason |
      | exited 1, stderr's tail "boom" | runtime_error | "boom" |
      | exited 0                       | no_result     | none   |


  Scenario: What the supervisor gives besides is the turn's
    Given the supervisor gives that the program was ended by the signal
      "killed"
    When claude-code runs a turn
    Then the turn gives that signal, and no reply

  Scenario: A program that could not start is the turn's
    Given the supervisor gives that the program could not start
    When claude-code runs a turn
    Then the turn gives that its program could not start
