# core/workflow, progress (docs/run-implementation.md, "Inputs and
# progress" and "Reuse"): each step's start or the call it reused, as its
# call reports them, its tool calls and its end reported to the events
# port by the step's name. Spies answer its ports (ADR-009, rule 1); the
# call port reports each step's start first, unless a scenario says
# otherwise.

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

  Scenario: A step's stale turn is an event
    Given the step "a", its call reporting a stale turn, "no event for
      1m", recovering
    When the workflow runs
    Then the events hold "a" stale, "no event for 1m", recovering

  Scenario: A step's start is told when its call reports it
    Given the step "a" on "bash"
    When the workflow runs
    Then no event is told before the call port is asked for "a", and
      then "a" started on "bash"

  Scenario Outline: A step whose call reports no start tells no end
    Given the step "a", its call reporting <report>
    When the workflow runs
    Then the events are <events>

    Examples:
      | report           | events            |
      | nothing          | none              |
      | it reused "R1/a" | "a" reused "R1/a" |

  Scenario: Each step's report reaches the call port
    Given the step "a", its call reporting "Bash" with "ls"
    When the workflow runs
    Then the call port was given a report for "a", and the event of
      "Bash" with "ls" names "a"
