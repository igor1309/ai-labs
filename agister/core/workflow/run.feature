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

  Scenario: The workflow's inputs are resolved once, at its boundary
    Given the workflow's input "goal" from the source "param", named
      "g", and the step "a" binding "t" from inputs.goal
    When the workflow runs with g "x"
    Then the inputs are resolved once, before "a" is called, and "a" is
      called with t "x"

  Scenario: A step that does not complete ends the run
    Given the steps "a", then "b"
    And "a" ends interrupted, class "timeout"
    When the workflow runs
    Then "b" is not called, and the run ends interrupted, class "timeout"

  Scenario: The run's output is its output mapping
    Given the steps "a", then "b", and the output "result" from
      steps.a.outputs
    And both complete, "a" with the exit code 7
    When the workflow runs
    Then the run completes, its output "result" being "a"'s output, the
      exit code 7

  Scenario: A param not given takes its default
    Given the param "base" with the default "main", and the step "a",
      binding "b" from params.base
    When the workflow runs with no param
    Then "a" is called with b "main"
