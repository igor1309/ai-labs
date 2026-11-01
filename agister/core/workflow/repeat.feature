# core/workflow, a repeat: its body, then its next state, then its
# stopping condition, until it holds or the body has run max times.
# Spies answer its ports.

Feature: A repeat runs its body until its condition holds, at most max times

  Background:
    Given the repeat "r", its state "code" from params.start, its body
      the step "fix" binding "c" from state.code, then the step "test",
      its next state "code" from steps.test.outputs.exit_code, until
      state.code equals 0, max 3

  Scenario Outline: The body runs until the condition holds or max is spent
    Given "test" completes with the exit codes <codes>, one a pass
    When the workflow runs with start "1"
    Then the body runs <passes> times, and the repeat's outputs are
      {"state": {"code": <last>}, "stopped": "<stopped>", "passes":
      <passes>}

    Examples:
      | codes   | passes | last | stopped |
      | 0       | 1      | 0    | until   |
      | 1, 0    | 2      | 0    | until   |
      | 1, 1, 1 | 3      | 1    | max     |

  Scenario: The condition is read after the body, never before the first pass
    Given "test" completes with the exit code 0
    When the workflow runs with start "0"
    Then the body runs once

  Scenario: Each pass's body reads the state the pass before left
    Given "test" completes with the exit codes 2, then 0
    When the workflow runs with start "1"
    Then "fix" is called with c "1", then with c "2"

  Scenario: A step in the body is told by its name and its pass
    Given "test" completes with the exit codes 1, then 0
    When the workflow runs with start "1"
    Then the caller is asked for "fix/1", "test/1", "fix/2", "test/2",
      in order, and the events are told the same names

  Scenario: A body step that does not complete ends the run
    Given "fix" fails on its second pass, class "runtime_error"
    And "test" completes with the exit code 1
    When the workflow runs with start "1"
    Then "test/2" is not called, and the run ends failed, class
      "runtime_error"

  Scenario: The events are told each pass's state and why the repeat stopped
    Given "test" completes with the exit codes 1, then 0
    When the workflow runs with start "1"
    Then the events are told pass 1 of "r" left the state {"code": 1},
      pass 2 left {"code": 0}, and "r" stopped "until" after 2 passes

  Scenario: A step in a repeat inside a repeat is told by both passes
    Given the body of "r" holds, after "test", the repeat "inner" of the
      step "lint", max 2, until steps.lint.outputs.done equals true,
      which "lint" never gives
    And "test" completes with the exit codes 1, then 0
    When the workflow runs with start "1"
    Then the caller is asked for "lint/1/1", "lint/1/2", then "lint/2/1"
      and "lint/2/2"
    And the events are told "inner/1" and "inner/2" each stopped "max"
      after 2 passes

  Scenario: The run's cost and usage count every pass
    Given "fix" costs 0.5 and uses 10 tokens a call
    And "test" completes with the exit codes 1, then 0
    When the workflow runs with start "1"
    Then the run's cost is 1.0 and its usage 20 tokens
