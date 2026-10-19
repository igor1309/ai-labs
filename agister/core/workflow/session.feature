# core/workflow, a step continuing a session (docs/run-implementation.md,
# "A binding continuing a session"; ADR-011, rule 3): a step given the
# session an earlier step's call reported. A spy answers its port, to
# call a step (ADR-012, rule 1).

Feature: A step continues an earlier step's session

  Scenario Outline: A step is given the session of the step it names
    Given the step "a", whose call reports the session "s1" and ends
      <ends>, then, after a parallel of "b", the step "c" continuing
      "a"'s session
    When the workflow runs
    Then "a" and "b" are called with no session, and "c" with "s1"

    Examples:
      | ends                        |
      | completed                   |
      | failed, class runtime_error |

  Scenario: A step of a parallel is given its session as well
    Given the parallel "p" of "a" and "b", "a"'s call reporting the
      session "s1", then the parallel "q" of "c" continuing "a"'s
      session, and "d"
    When the workflow runs
    Then "c" is called with "s1", and "d" with no session

  Scenario: A step whose named step reported no session is not called
    Given the parallel "p" of "a", whose call reports no session, then
      the step "c" continuing "a"'s session
    When the workflow runs
    Then "c" is not called, and the run ends failed, class "refused",
      its reason 'the step "a" reported no session'
