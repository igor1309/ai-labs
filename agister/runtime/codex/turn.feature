# runtime/codex, the codex wrapper's turn (docs/run-implementation.md, "A
# step on a model runtime"; ADR-003, rule 6): codex exec through the
# supervisor, its JSON events read. A spy answers in place of the
# supervisor, fed recorded lines (ADR-009, rule 3); the schema's folder is
# a temporary directory.

Feature: The codex wrapper runs a turn

  Scenario: A turn asks the supervisor for codex exec, the message on stdin
    When codex runs the message "m" in "/r" with goal=g, the instruction
      "i", the model "gpt-6.1-sol", the effort "high", the option
      "read-only", and the schema "{}"
    Then the supervisor is asked to run "codex" in "/r" with goal=g,
      given the text "<instructions>\ni\n</instructions>\n\nm", and the
      arguments "exec", "--json", "--skip-git-repo-check", "--sandbox",
      "read-only", "--config", "approval_policy=\"never\"",
      "--ignore-user-config", "--ignore-rules", "--model", "gpt-6.1-sol",
      "--config", "model_reasoning_effort=\"high\"", "--output-schema",
      a file holding "{}", and "-"
    And the file is gone once the turn has returned

  Scenario: What is not given is left out
    When codex runs the message "m" with the option "read-only" alone
    Then it is given the text "m", and the arguments end at
      "--ignore-rules", "-"

  Scenario Outline: A turn is given exactly one option
    When codex runs the message "m" with <options>
    Then it gives its error, and the supervisor is asked nothing

    Examples:
      | options                                       |
      | no option                                     |
      | the options "read-only" and "workspace-write" |

  Scenario: A completed turn is the reply
    Given the lines of thread.started of "t1", an error event, an
      agent_message "first", an agent_message "last", and turn.completed
      of the usage 10 input, 4 cached input, 3 output and 2 reasoning
      tokens
    When codex runs a turn
    Then the reply's text is "last", its session "t1", its usage 10
      input, 4 cache read, 3 output and 2 reasoning tokens, its cost
      unknown, and no failure class

  Scenario: With a schema, the last message is the structured output
    Given a schema, and the lines of an agent_message "{\"ok\":true}"
      and turn.completed
    When codex runs a turn
    Then the reply's structured output is {"ok":true}

  Scenario Outline: A turn.failed is classed by its words
    Given the lines of thread.started and turn.failed "<message>"
    When codex runs a turn
    Then the reply's failure class is "<class>", its reason the message

    Examples:
      | message                       | class            |
      | Selected model is at capacity | capacity         |
      | You've hit your usage limit   | rate_limited     |
      | 401 Unauthorized              | auth             |
      | exceeds the context window    | context_overflow |
      | stream disconnected           | runtime_error    |

  Scenario Outline: A schema given and no JSON message is invalid output
    Given a schema, and the lines of <message> and turn.completed
    When codex runs a turn
    Then the reply's failure class is "invalid_output"

    Examples:
      | message                     |
      | no agent_message            |
      | an agent_message "not json" |

  Scenario Outline: With no deciding event, how the program exited decides
    Given the lines of thread.started, and the program <exited>
    When codex runs a turn
    Then the reply's failure class is "<class>", its reason <reason>

    Examples:
      | exited                         | class         | reason |
      | exited 1, stderr's tail "boom" | runtime_error | "boom" |
      | exited 0                       | no_result     | none   |

  Scenario: A turn.failed with a schema given is the runtime's failure
    Given a schema, and the lines of turn.failed "401 Unauthorized"
    When codex runs a turn
    Then the reply's failure class is "auth"

  Scenario: A program that could not start is the turn's
    Given the supervisor gives that the program could not start
    When codex runs a turn
    Then the turn gives that its program could not start, and the
      schema's file is gone
