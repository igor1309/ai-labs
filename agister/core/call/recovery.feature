# core/call, a recovery turn (docs/run-implementation.md, "Recovery";
# ADR-006, rules 3 to 5). Spies answer the runtime protocol, the watch,
# the clock and the timer (ADR-009, rule 1). The step's recovery is 1
# resume, its instruction "Go on.", unless a scenario says otherwise.

Feature: A stale turn is followed by a recovery turn

  Scenario: A stale turn with a resume left is recovered in its session
    Given a model step whose first turn reports the session "s1", then
      goes stale, the watch reporting "no event for 21m"
    And its second turn completes with the text "done"
    When the call is made
    Then the second turn is given the session "s1" and the message "Go
      on.\n\nno event for 21m", and the step's model, effort, options,
      instruction and schema
    And the call ends completed, its output the text "done"
    And it reports the stale turn, "no event for 21m", recovering

  Scenario Outline: A stale turn not recovered ends the call
    Given a model step whose recovery is <recovery>, and whose turns go
      stale <turns>
    When the call is made
    Then it makes <made>, and ends as the last stale turn ends it, its
      last report of a stale turn not recovering

    Examples:
      | recovery  | turns                                                 | made     |
      | none      | once, on "no event for 21m"                           | one turn |
      | 1 resume  | twice, on "no event for 21m", then "Bash ran over 1m" | 2 turns  |
      | 2 resumes | twice, each on "no event for 21m"                     | 2 turns  |
      | 1 resume  | once, its turn having reported no session             | one turn |

  Scenario: A recovered call's cost and usage are its turns', summed
    Given a model step whose first turn goes stale, reporting no cost,
      and whose recovery turn completes, its cost 0.5 and input tokens 10
    When the call is made
    Then the call's cost is 0.5 and its input tokens 10

  Scenario: The call's time limit spans its turns
    Given a model step of the time limit 10m, whose first turn goes stale
      at 6m, and whose recovery turn runs on
    When the timer reaches 10m
    Then the recovery turn is ended, and the call ends interrupted,
      class "timeout"
