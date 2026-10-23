# core/workflow, a branch (docs/run-implementation.md, "Branch and
# repeat"; ADR-011, rules 2, 4 and 6): the first arm whose condition
# holds runs, else the default; the branch's outputs are that arm's.
# Spies answer its ports (ADR-009, rule 1).

Feature: A branch runs one arm

  Scenario Outline: The first arm whose condition holds runs, else the default
    Given the step "t" completes with the output {"exit_code": <code>}
    And the branch "b" of the arm "zero", if steps.t.outputs.exit_code
      equals 0, the arm "two", if it equals 2, and the default "other"
    When the workflow runs
    Then only the arm <arm> is called after "t"

    Examples:
      | code | arm   |
      | 0    | zero  |
      | 2    | two   |
      | 1    | other |

  Scenario: Two arms whose conditions hold, the first runs
    Given the step "t" completes with the output {"v": "x"}
    And the branch "b" of the arm "one", if steps.t.outputs.v is present,
      the arm "two", if the same, and the default "other"
    When the workflow runs
    Then "one" is called, and "two" and "other" are not

  Scenario: A branch's outputs are its arm's output mapping
    Given the branch "b" whose default "d" completes with {"s": "done"}
      and maps the output "summary" from steps.d.outputs.s
    And the step "j" binding "x" from steps.b.outputs.summary
    When the workflow runs
    Then "j" is called with x "done"

  Scenario: An arm that does not complete ends the run
    Given the branch "b" whose default "d" fails, class "runtime_error",
      then the step "j"
    When the workflow runs
    Then "j" is not called, and the run ends failed, class
      "runtime_error"

  Scenario: The events are told the arm taken and each condition read
    Given the step "t" completes with the output {"exit_code": 1}
    And the branch "b" of the arm "zero", if steps.t.outputs.exit_code
      equals 0, and the default "other"
    When the workflow runs
    Then the events are told the branch "b" took "other", the arm
      "zero"'s condition false, having read the value 1

  Scenario: A branch whose arm is a repeat gives the repeat's state
    Given the arm "other" is a repeat "fix" whose state "review" ends
      {"done": true}, the branch's outputs summary from
      steps.fix.outputs.state.review
    When the workflow runs with "a" exiting 1
    Then the branch's outputs are {"summary": {"done": true}}
