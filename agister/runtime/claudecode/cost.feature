# runtime/claudecode, a turn's cost and budget (docs/run-implementation.md,
# "A call's cost"; ADR-004, rule 7; ADR-012, rule 5). A spy answers in
# place of the supervisor, fed recorded lines (ADR-009, rule 3). Claude
# reports a resumed session's cost to date as the turn's.

Feature: The claude-code wrapper counts a turn's own cost

  Scenario: A turn's cost is the reported cost less the session's before
    Given a success result of the session "s1" and the cost 1.25
    When claude-code runs the message "m" with the session "s1", its
      cost before 1
    Then the reply's cost is 0.25, its source "claude-code", and its
      session's cost 1.25

  Scenario: A turn given no session counts from zero
    Given a success result of the session "s1" and the cost 0.25
    When claude-code runs the message "m" with no session and no cost
      before
    Then the reply's cost is 0.25, and its session's cost 0.25

  Scenario Outline: A turn's cost is unknown where it cannot be told
    Given a success result of the session "s1" and <reported>
    When claude-code runs the message "m" with the session "s1", its
      cost before <before>
    Then the reply's cost is unknown, and its session's cost <session>

    Examples:
      | reported   | before  | session |
      | the cost 1 | unknown | 1       |
      | the cost 1 | 1.5     | 1       |
      | no cost    | 1       | unknown |

  Scenario: A budget is passed to claude
    When claude-code runs the message "m" with the effort "high" and the
      budget 0.75
    Then the arguments hold "--effort", "high", "--max-budget-usd",
      "0.75", in that order

  Scenario: No budget given passes none
    When claude-code runs the message "m" with nothing else
    Then the arguments hold no "--max-budget-usd"

  Scenario: A turn ended at its budget is budget_exhausted
    Given the lines of an init event, and a result error_max_budget_usd
      of is_error true and the errors "Reached maximum budget ($0.75)",
      the cost 0.8
    When claude-code runs the message "m" with no session
    Then the reply's failure class is "budget_exhausted", its reason the
      result's errors, and its cost 0.8
