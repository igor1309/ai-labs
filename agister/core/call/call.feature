# core/call (docs/run-implementation.md, "The first run"; ADR-012, rule 7;
# ADR-001, invariant 3): a call is one turn on bash, ending in the result
# shape. A spy answers the runtime protocol, and a clock spy the time
# (ADR-009, rule 1).

Feature: A call makes its turn and ends in the result shape

  Scenario: The turn is given the script, the directory and the
    environment, each input by its name
    Given a step whose script is "s", its environment A=1 and B=2, and
      its input "B" of value "3", in the directory "/r", over Agister's
      environment PATH=/bin and A=0
    When the call is made
    Then the turn is given "s", "/r", and PATH=/bin, A=1 and B=3

  Scenario Outline: How the turn ended decides the status and class
    Given the turn <ended>
    When the call is made
    Then it ends <status>, class "<class>"

    Examples:
      | ended                                     | status      | class               |
      | exits with code 0                         | completed   |                     |
      | exits with code 4                         | completed   |                     |
      | cannot start its program                  | failed      | runtime_unavailable |
      | gives another error                       | failed      | runtime_error       |
      | is running when the caller cancels        | interrupted | cancelled           |
      | is ended by a signal Agister did not send | failed      | killed              |

  Scenario: A completed call's output is the exit code and both streams
    Given the turn exits with code 4, stdout "o" and stderr "e"
    When the call is made
    Then its output is the exit code 4, and stdout and stderr, each its
      head, tail, size and digest

  Scenario: A time limit ends the turn
    Given a time limit of 1s, and a turn that has not ended
    When the clock passes 1s
    Then the turn's context is ended, and the call ends interrupted,
      class "timeout"

  Scenario: Timing is measured, and the cost is unknown
    Given the clock reads 10:00:00 at the start and 10:00:05 at the end
    When the call is made
    Then its timing is from 10:00:00 to 10:00:05, 5s, and its cost is
      unknown

  Scenario: The step's warnings are the call's, whatever its status
    Given the step's plan warns "grants network beyond what it allows"
    And the turn is ended by the time limit
    When the call is made
    Then it ends interrupted, its warnings that one
