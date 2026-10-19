# runstore, a wrapper (docs/run-implementation.md, "A call's cost";
# ADR-001, invariant 6): a call's session cost in its run's record.
# Contract tests against real files, in a temporary folder (ADR-009,
# rule 3).

Feature: runstore keeps a call's session cost

  Scenario Outline: A call's session cost is written and given back
    Given runstore over the folder "runs"
    When the record of the run "x" is written, its call "a" of the cost
      0.5 and <session>
    Then the record holds the call's "session_cost" <json>
    And reading "x" gives the call <given>

    Examples:
      | session               | json | given                 |
      | the session cost 1.25 | 1.25 | the session cost 1.25 |
      | no session cost       | null | no session cost       |

  Scenario: An entry from before reads as no session cost
    Given runstore over the folder "runs", holding the record of "x"
      whose call "a" has no "session_cost"
    When "x" is read
    Then its call "a" has no session cost
