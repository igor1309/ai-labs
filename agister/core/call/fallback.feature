# core/call, a call at capacity made again on its fallback
# (docs/run-implementation.md, "Capacity"; ADR-004, rule 8). Spies answer
# the runtime protocol of each agent, the watch, the clock and the timer
# (ADR-009, rule 1). The primary's every turn fails at capacity, its
# reason "Selected model is at capacity", unless a scenario says
# otherwise.

Feature: A call at capacity falls back to another agent

  Scenario: A call whose turns at capacity are spent is made on its fallback
    Given a model step continuing the session "s0", its input "goal",
      its model "gpt", whose primary's turns report the session "s0",
      and a fallback of the model "opus" whose turn completes, its text
      "done", its session "f1"
    When the call is made, and its four waits pass
    Then the fallback is given one turn, in no session, its message the
      step's, its model "opus"
    And the call ends completed, its output the text "done", its session
      "f1", its timing from the primary's start to the fallback's end
    And its primary is the first call's result: failed, class "capacity",
      the reason "5 of 5 turns at capacity: Selected model is at capacity"
    And it reports 5 turns at capacity, then that it falls back

  Scenario Outline: Only a call at capacity falls back
    Given a model step whose primary's turn ends <how>
    When the call is made
    Then the fallback is given no turn, the call ends <status>, class
      <class>, and has no primary

    Examples:
      | how                                 | status    | class            |
      | completed                           | completed |                  |
      | a reply of the class "rate_limited" | failed    | rate_limited     |
      | a reply of the class "auth"         | failed    | auth             |
      | a runtime error                     | failed    | runtime_error    |
      | at capacity, its cost limit spent   | failed    | budget_exhausted |

  Scenario: A fallback at capacity ends the call
    Given a model step whose fallback's every turn fails at capacity too
    When the call is made, and the waits of both pass
    Then the fallback makes 5 turns, and the call ends failed, class
      "capacity", the reason "5 of 5 turns at capacity: Selected model is
      at capacity", its primary failed, class "capacity"
    And it reports that it falls back once

  Scenario Outline: The fallback is given what the call left of its limits
    Given a model step of the time limit 15m, the cost limit <limit> and
      the daily budget <day>, whose primary's turns each cost 0.5 and
      used 10 input tokens, and whose fallback's turn costs 1 and uses
      100, each cost's source "s"
    When the call is made, and its four waits pass
    Then the fallback's time limit is 5m30s and its turn's budget <budget>
    And the call's cost is 3.5, its source "s", its usage 150 input tokens

    Examples:
      | limit | day                   | budget |
      | 3     | none                  | 0.5    |
      | 5     | 4.5, of which 1 spent | 1      |

  Scenario Outline: Fallback reporting keeps the call's deadline
    Given a model step of the time limit 5m whose primary ends at capacity
      after 4m30s, its fourth turn not retried, and whose fallback
      completes with the text "done"
    When the synchronous fallback report takes <delay>
    Then the fallback gets <remaining> and the call ends <status>

    Examples:
      | delay | remaining            | status                     |
      | 10s   | 20s                  | completed, text "done"     |
      | 30s   | no turn and no timer | with the primary's failure |
      | 31s   | no turn and no timer | with the primary's failure |

  Scenario: Unknown primary cost keeps known spend in fallback budgets
    Given five primary turns at capacity, one unpriced and four costing
      0.5 each, with 2.5 left of either the call limit or the daily budget
    When the primary's four waits pass and the fallback is called
    Then its turn has a budget of 0.5, whichever primary turn was unpriced
    And the reported total cost stays unknown
    And a fallback spending 0.5 at capacity ends budget_exhausted, without
      a retry
