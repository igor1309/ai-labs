# core/call, a call on a model (docs/run-implementation.md, "A step on a
# model runtime" and "Continuation"; ADR-012, rules 2 and 7; ADR-001,
# invariant 3): the inputs in the message, the reply checked against the
# schema. A spy answers the runtime protocol, a validator spy the schema, a
# clock spy the time and a timer spy the time limit (ADR-009, rule 1).

Feature: A call on a model takes its inputs in its message

  Scenario: The message is each input, then each document, in sections
    Given a model step whose inputs are "goal" of "g" and "brief" of
      "a\nb", in that order, its document "prompt" of "p", its
      environment A=1, over Agister's environment PATH=/bin
    When the call is made
    Then the turn is given the message "## goal\n\ng\n\n## brief\n\n"
      "```\na\nb\n```\n\n## prompt\n\np", the two joined, and the environment
      PATH=/bin and A=1
    And its environment holds no input

  Scenario Outline: A text with a newline is fenced, longer than any
    backtick run in it
    Given a model step whose input "diff" is <text>
    When the call is made
    Then the message is <message>

    Examples:
      | text       | message                             |
      | "x\n````y" | "## diff\n\n`````\nx\n````y\n`````" |
      | "hi\n"     | "## diff\n\n```\nhi\n```"           |
      | "one line" | "## diff\n\none line"               |

  Scenario: The turn is given what the step gives of the model
    Given a model step whose instruction is "i", its model "opus", its
      effort "high", its options "Read" and "Grep", and its schema "s"
    When the call is made
    Then the turn is given the instruction "i", the model "opus", the
      effort "high", the options "Read" and "Grep", and the schema "s"

  Scenario Outline: The reply decides the status and class
    Given a model step <schema>, and the turn exits 0 with a reply
      <reply>
    When the call is made
    Then it ends <status>, class "<class>"

    Examples:
      | schema         | reply                                             | status    | class          |
      | with no schema | of the text "t"                                   | completed |                |
      | with a schema  | the validator accepts                             | completed |                |
      | with a schema  | the validator rejects                             | failed    | invalid_output |
      | with a schema  | of the failure class "invalid_output"             | failed    | invalid_output |
      | with a schema  | of the failure class "auth", no structured output | failed    | auth           |
      | with no schema | of the failure class "rate_limited"               | failed    | rate_limited   |
      | with no schema | of the failure class "no_result"                  | lost      | no_result      |
      | with no schema | of the failure class "overloaded"                 | failed    | runtime_error  |

  Scenario Outline: How the program ended comes before the reply
    Given a model step, and the turn <ended>, with a reply of the
      text "t"
    When the call is made
    Then it ends <status>, class "<class>"

    Examples:
      | ended                                     | status      | class         |
      | is cancelled by the caller, then exits 0  | interrupted | cancelled     |
      | is ended by a signal Agister did not send | failed      | killed        |
      | gives another error                       | failed      | runtime_error |

  Scenario Outline: A completed call's output is what the reply gives
    Given a model step <schema>, and the turn's reply of the text "t" and
      the structured output {"ok":true}
    When the call is made
    Then its output is <output>

    Examples:
      | schema         | output       |
      | with a schema  | {"ok":true}  |
      | with no schema | {"text":"t"} |

  Scenario: A step continuing a session gives its turn the session
    Given a model step continuing the session "s1"
    When the call is made
    Then the turn is given the session "s1", and the message as it is
      for a step that continues none
