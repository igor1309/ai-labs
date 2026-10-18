# core/call, a turn at capacity retried (docs/run-implementation.md,
# "Capacity"; ADR-004, rule 8). Spies answer the runtime protocol, the
# watch, the clock and the timer (ADR-009, rule 1). A model step's turn
# that fails at capacity gives a reply of the class "capacity", its
# reason "Selected model is at capacity".

Feature: A turn failed on capacity is retried

  Scenario: A turn at capacity resumes its session after a wait
    Given a model step whose first turn reports the session "s1", then
      fails at capacity, and whose second turn completes, its text "done"
    When the call is made
    Then the second turn starts once the timer has waited 30s, given
      the session "s1" and the step's message, model, effort, options,
      instruction and schema
    And the call ends completed, its output the text "done"
    And it reports the turn at capacity, retrying in 30s

  Scenario: A turn at capacity with no session runs again
    Given a model step whose first turn fails at capacity, reporting no
      session, and whose second turn completes
    When the call is made
    Then the second turn is given the step's session, none, and the
      call ends completed

  Scenario: Three turns at capacity end the call
    Given a model step whose every turn fails at capacity
    When the call is made
    Then it makes 3 turns, the timer waiting 30s, then 60s, between them
    And it ends failed, class "capacity", the reason "3 turns at
      capacity: Selected model is at capacity"
    And its last report of a turn at capacity has no retry

  Scenario Outline: A wait that is ended ends the call
    Given a model step of the time limit 10m, whose first turn fails at
      capacity at 9m45s
    When <what> during the wait
    Then it makes one turn, and ends interrupted, class "<class>"

    Examples:
      | what                        | class     |
      | the time limit passes       | timeout   |
      | the caller cancels the call | cancelled |

  Scenario: A turn at capacity that reported another session fails
    Given a model step whose first turn reports the session "s1", then
      goes stale, and whose recovery turn reports the session "s2", then
      fails at capacity
    When the call is made
    Then it makes 2 turns, the timer waiting for no retry, and ends
      failed, class "runtime_error", the reason that the turn reported
      the session "s2", not "s1"

  Scenario: A rerun keeps the session its turn was given
    Given a model step whose first turn reports the session "s1", then
      goes stale, and whose recovery turn fails at capacity, reporting
      no session, and whose third turn completes
    When the call is made
    Then the third turn is given the session "s1"

  Scenario: A retry spends none of the recovery
    Given a model step of 1 resume, whose first turn fails at capacity,
      whose second goes stale, and whose third completes
    When the call is made
    Then it makes 3 turns, the third a recovery turn, and ends completed
