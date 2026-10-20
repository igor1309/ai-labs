# core/call, a call under a daily budget (docs/run-implementation.md, "A
# daily budget"; ADR-004, rule 7). Spies answer the runtime protocol, the
# watch, the clock and the timer (ADR-009, rule 1). A turn reports its
# own cost, and the session's cost after it.

Feature: A call is kept to what is left of the day

  Scenario Outline: A turn's budget is the least of the limit's and the day's
    Given a model step of <limit>, under the daily budget 20 of which
      the day has spent <spent>, whose turn completes
    When the call is made
    Then its turn is given the budget <budget>

    Examples:
      | limit            | spent | budget |
      | no cost limit    | 19    | 1      |
      | the cost limit 3 | 19    | 1      |
      | the cost limit 3 | 10    | 3      |

  Scenario: A step with no daily budget is given its limit's
    Given a model step of the cost limit 3, with no daily budget, whose
      turn completes
    When the call is made
    Then its turn is given the budget 3

  Scenario: Each turn's budget counts the call's known cost
    Given a model step under the daily budget 20 of which the day has
      spent 19, whose first turn reports the session "s1", its cost
      0.25, then fails at capacity, and whose second turn completes
    When the call is made
    Then the first turn is given the budget 1, and the second 0.75

  Scenario Outline: A call on a spent day takes no turn
    Given a <step> under the daily budget 20 of which the day has spent
      <spent>
    When the call is made
    Then it makes no turn and ends failed, class "budget_exhausted", the
      reason "the daily budget 20 is spent: <spent>"

    Examples:
      | step                           | spent |
      | model step                     | 20    |
      | model step                     | 21.5  |
      | step on a runtime with no cost | 20    |

  Scenario: No retry starts once the day is spent
    Given a model step under the daily budget 20 of which the day has
      spent 19, whose first turn reports the session "s1", its cost 1.5,
      then fails at capacity, and whose second turn completes
    When the call is made
    Then it makes one turn, no wait started, and ends failed, class
      "budget_exhausted", the reason "the daily budget 20 is spent:
      20.5"
    And its report of the turn at capacity has no retry

  Scenario: No recovery starts once the day is spent
    Given a model step of one resume, under the daily budget 20 of which
      the day has spent 19, whose first turn reports the session "s1",
      its cost 1.5, then goes stale
    When the call is made
    Then it makes one turn, its stale turn reported not recovering, and
      ends failed, class "budget_exhausted", the reason "the daily
      budget 20 is spent: 20.5"

  Scenario: The limit's reason is given where both are spent
    Given a model step of the cost limit 1, under the daily budget 20 of
      which the day has spent 19, whose first turn reports the session
      "s1", its cost 1, then fails at capacity
    When the call is made
    Then it ends failed, class "budget_exhausted", the reason "the cost
      limit 1 is spent: 1"
