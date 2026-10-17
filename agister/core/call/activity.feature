# core/call, a turn's tool calls (docs/run-implementation.md, "Inputs and
# progress"): passed on as the runtime reports them. A spy answers the
# runtime protocol (ADR-009, rule 1).

Feature: A call passes on the tool calls its turn reports

  Scenario: Each tool call reaches the call's report, in order
    Given a model step, and the turn reports "Bash" with "ls", then
      "Read" with "a.go", then replies
    When the call is made with a report
    Then the report is given "Bash" with "ls", then "Read" with "a.go",
      before the call ends

  Scenario: A call made with no report reports nothing, and runs
    Given a model step, and the turn reports "Bash" with "ls"
    When the call is made with no report
    Then it ends as its reply says
