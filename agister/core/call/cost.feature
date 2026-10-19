# core/call, a call's cost and its cost limit (docs/run-implementation.md,
# "A call's cost"; ADR-004, rule 7; ADR-012, rule 5). Spies answer the
# runtime protocol, the watch, the clock and the timer (ADR-009, rule 1).
# A turn reports its own cost, and the session's cost after it.

Feature: A call is kept to its cost limit

  Scenario: Each turn is given the session's cost before it
    Given a model step continuing the session "s1", its cost before 1,
      whose first turn goes stale, reporting no reply, and whose
      recovery turn completes, its session's cost 2
    When the call is made
    Then the first turn is given the session's cost before 1, and the
      recovery turn an unknown one
    And the call's session's cost is 2

  Scenario: A new session's first turn is given zero
    Given a model step with no session, whose first turn reports the
      session "s1", its cost 0.25 and session's cost 0.25, then fails at
      capacity, and whose second turn completes
    When the call is made
    Then the first turn is given the session's cost before 0, and the
      second 0.25

  Scenario: Each turn's budget is the limit less the call's cost so far
    Given a model step of the cost limit 1, whose first turn reports the
      session "s1", its cost 0.25, then fails at capacity, and whose
      second turn completes, its cost 0.5
    When the call is made
    Then the first turn is given the budget 1, and the second 0.75
    And the call ends completed, its cost 0.75

  Scenario: A step with no limit gives no budget
    Given a model step with no cost limit, whose turn completes
    When the call is made
    Then its turn is given no budget

  Scenario Outline: No retry starts once the limit is spent
    Given a model step of the cost limit 1, whose first turn reports the
      session "s1", its cost <cost>, then fails at capacity, and whose
      second turn completes
    When the call is made
    Then it makes one turn, no wait started, and ends failed, class
      "budget_exhausted", the reason "the cost limit 1 is spent: <cost>"
    And its report of the turn at capacity has no retry

    Examples:
      | cost |
      | 1    |
      | 1.5  |

  Scenario: No recovery turn starts once a turn's cost is unknown
    Given a model step of the cost limit 1, whose first turn reports the
      session "s1", then goes stale, giving no reply, and whose recovery
      turn completes
    When the call is made
    Then it makes one turn, and ends failed, class "budget_exhausted",
      the reason "the cost limit 1 cannot be kept: a turn's cost is
      unknown"
    And its report of the stale turn is not recovering

  Scenario: A turn ended at its budget ends the call
    Given a model step of the cost limit 1, whose turn fails
      budget_exhausted, its reason "Reached maximum budget ($1)", its
      cost 1.1
    When the call is made
    Then it ends failed, class "budget_exhausted", its reason the
      runtime's, its cost 1.1
