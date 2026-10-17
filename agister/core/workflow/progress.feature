# core/workflow, progress (docs/run-implementation.md, "Inputs and
# progress"): each step's start, tool calls and end reported to the events
# port by the step's name. Spies answer its ports (ADR-012, rule 1).

Feature: A workflow reports what each step is doing

  Scenario: A step's start, its tool calls and its end, in order
    Given the steps "a" on the agent "claude-opus", reporting the tool
      call "Bash" with "ls" and completing in 2s, then "b" on "bash",
      failing, class "killed", in 1s
    When the workflow runs
    Then the events are, in order: "a" started on "claude-opus"; "a"
      "Bash" with "ls"; "a" ended completed in 2s; "b" started on
      "bash"; "b" ended failed, class "killed", in 1s

  Scenario: A step that is not called reports nothing
    Given the steps "a", failing, then "b"
    When the workflow runs
    Then no event names "b"

  Scenario: Each step's report reaches the call port
    Given the step "a", its call reporting "Bash" with "ls"
    When the workflow runs
    Then the call port was given a report for "a", and the event of
      "Bash" with "ls" names "a"
