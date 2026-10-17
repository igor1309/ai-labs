# cmd/agister, progress (docs/run-implementation.md, "Inputs and
# progress"): best effort, what core reports of a run printed to stderr
# as it comes, with spies in place of the wrappers (ADR-009, rule 4).
# Settings: home's as shipped, with the repository's process "ask" on a
# model, as model.feature gives it.

Feature: The composition prints a run's progress to stderr

  Scenario: A step's start, tool calls and end, each a line
    Given claude-code reports the tool calls "Bash" and "Read", then
      fails, class "rate_limited"
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then stderr has, in order, a line each: "ask" started on
      "claude-opus"; "Bash"; "Read"; "ask" ended failed "rate_limited"
    And stdout holds only the result

  Scenario: A line is not printed; a long tool call is cut where printed
    Given claude-code reports a line, then the tool call "Write" with 500
      bytes, then replies
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then stderr has no line for the line, and the "Write" line is cut
      short
