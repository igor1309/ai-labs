# core/workflow, a parallel (docs/run-implementation.md, "Parallel steps
# and a join"; ADR-011, rule 2): a parallel's steps called at once, its
# outputs each step's end, in declaration order. Spies answer its ports
# (ADR-009, rule 1).

Feature: A parallel's steps run side by side

  Scenario: Each step of a parallel is called before any has ended
    Given the parallel "p" of the steps "a" and "b", each ending only
      once both have been called
    When the workflow runs
    Then both are called, and the run completes

  Scenario: A join reads each step's end, in declaration order
    Given the parallel "p" of "a", "b" and "c", where "b" ends first,
      completing with the output {"v": 2}, "c" fails, class
      "rate_limited", and "a" completes with {"v": 1}
    And the step "j" binding "all" from steps.p.outputs
    When the workflow runs
    Then "j" is called with all the JSON list:
      {"status": "completed", "class": null, "output": {"v": 1}},
      {"status": "completed", "class": null, "output": {"v": 2}},
      {"status": "failed", "class": "rate_limited", "output": null}

  Scenario Outline: A step that does not complete does not end the run
    Given the parallel "p" of "a" and "b", where "b" ends <status>,
      class <class>, then the step "j"
    When the workflow runs
    Then "j" is called, and the run ends as "j" ends

    Examples:
      | status      | class         |
      | failed      | runtime_error |
      | interrupted | timeout       |
      | lost        | no_result     |

  Scenario: A run whose last item is a parallel completes
    Given the parallel "p" of "a" and "b", where "b" fails, class
      "runtime_error", its reason "r", and the output "all" from
      steps.p.outputs
    When the workflow runs
    Then the run completes, its reason none, its output "all" the list
      of both

  Scenario: A cancelled run ends after its parallel's steps have ended
    Given the parallel "p" of "a" and "b", then the step "j"
    When the run is cancelled while "a" and "b" run, and both end
      interrupted, class "cancelled"
    Then "j" is not called, and the run ends interrupted, class
      "cancelled", once "a" and "b" have ended

  Scenario: A parallel's steps count as steps in sequence do
    Given the parallel "p" of "a", its usage 10 input, cost 1, the
      session "s1" and the warning "w1", and "b", its usage 5 input,
      cost 2 and the warning "w2", where "b" ends first
    When the workflow runs
    Then its usage is 15 input, its cost 3, its sessions "a" to "s1",
      and its warnings "w1", then "w2"

  Scenario: Each step's events name the step
    Given the parallel "p" of "a" on "codex-sol-61", reporting "Bash"
      with "ls", and "b" on "claude-opus"
    When the workflow runs
    Then the events hold "a" started on "codex-sol-61", "a" "Bash" with
      "ls", "a" ended, "b" started on "claude-opus" and "b" ended, each
      step's own in order

  Scenario: With max 1, a parallel's steps run one at a time, in order
    Given the parallel "p" of "a", "b" and "c", max 1, each step running
      until the test ends it
    When the workflow runs
    Then "a" is called, then "b" once "a" has ended, then "c" once "b"
      has ended, and no two run at once

  Scenario: With max 2, two steps run at once, never three
    Given the parallel "p" of "a", "b" and "c", max 2, where "a" and "b"
      each end only once both have been called
    When the workflow runs
    Then "a" and "b" run at once, "c" after one of them, and no three at
      once

  Scenario: With max 1, a step that does not complete does not stop the next
    Given the parallel "p" of "a", "b" and "c", max 1, where "a" fails,
      class "capacity", "b" completes with {"v": 2}, and "c" ends
      interrupted, class "timeout"; then the step "j" binding "all" from
      steps.p.outputs
    When the workflow runs
    Then "a", "b", "c" and "j" are called, in that order, and "j" is
      given each step's end, in declaration order

  Scenario: With max 1, a cancelled run calls no further step
    Given the parallel "p" of "a" and "b", max 1, then the step "j"
    When the run is cancelled while "a" runs, and "a" ends interrupted,
      class "cancelled"
    Then neither "b" nor "j" is called, and the run ends interrupted,
      class "cancelled"
