# core/workflow (docs/run-implementation.md, "The first run"; ADR-011,
# rules 3 and 5): a workflow of steps, run in order. A spy answers its
# port, to call a step (ADR-012, rule 1).

Feature: A workflow's steps run in order

  Scenario: Each step is called in order, its process's params bound
    Given the workflow "w" with the param "goal", and the steps "a",
      binding its process's param "g" from params.goal, then "b",
      binding "code" from steps.a.outputs.exit_code
    And "a" completes with the exit code 0
    When "w" runs with goal "x"
    Then "a" is called with the param g "x", then "b" with code "0"

  Scenario: A binding reads a field within a step's output field
    Given the steps "a", then "b", binding "what" from
      steps.a.outputs.stdout.head
    And "a" completes, its stdout's head "hi" followed by a newline
    When the workflow runs
    Then "b" is called with what "hi" followed by a newline

  Scenario: The workflow's inputs are resolved once, at its boundary
    Given the workflow's input "goal" from the source "param", named
      "g", and the step "a" binding "t" from inputs.goal
    When the workflow runs with g "x"
    Then the inputs are resolved once, before "a" is called, and "a" is
      called with t "x"

  Scenario Outline: A step that does not complete ends the run
    Given the steps "a", "b", then "c", and the output "result" from "r"
    And the steps before <step> complete, and <step> ends <status>, class
      <class>
    When the workflow runs
    Then no step after <step> is called, and the run ends <status>, class
      <class>, with no output

    Examples:
      | step | status      | class               |
      | a    | failed      | runtime_error       |
      | b    | failed      | runtime_unavailable |
      | a    | interrupted | timeout             |
      | b    | interrupted | cancelled           |
      | c    | failed      | killed              |
      | b    | lost        | no_result           |

  Scenario Outline: The run's output is its output mapping
    Given the param "p", the input "i" from the source "param" named "p",
      the steps "a", then "b", and the output "result" from <reads>
    And both complete, "a" with the exit code 7
    When the workflow runs with p "x"
    Then the run completes, its output "result" being <value>

    Examples:
      | reads           | value                         |
      | steps.a.outputs | "a"'s output, the exit code 7 |
      | params.p        | "x"                           |
      | inputs.i        | "x"                           |

  Scenario: The run's timing, cost and warnings cover its calls
    Given the clock reads 10:00:00 when the run starts and 10:00:09 when
      it ends, and the steps "a" and "b" complete, each its cost unknown,
      "a" warning "w1" and "b" "w2"
    When the workflow runs
    Then its timing is 10:00:00 to 10:00:09, its cost unknown, and its
      warnings "w1", then "w2"

  Scenario: A param not given takes its default
    Given the param "base" with the default "main", and the step "a",
      binding "b" from params.base
    When the workflow runs with no param
    Then "a" is called with b "main"

  Scenario: The run's usage sums what its calls reported, and its reason
    is its last call's
    Given the step "a" completes, its usage 10 input and 3 output, and
      the step "b" fails, its usage 5 input and its reason "r"
    When the workflow runs
    Then its usage is 15 input and 3 output, the rest null, and its
      reason "r"

  Scenario: A run carries each step's session by its name
    Given the step "a" reports the session "s1", and "b" none
    When the workflow runs
    Then its sessions are "a" to "s1", and nothing for "b"
