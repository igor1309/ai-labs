# cmd/agister, a daily budget (docs/run-implementation.md, "A daily
# budget"; ADR-001, invariant 3; ADR-004, rule 7), with spies in place
# of the wrappers (ADR-009, rule 4). Settings as record.feature gives
# them, home's budget file "daily: {cost: 20}"; the host's time zone is
# UTC+3, its clock 2026-10-20 10:00 there; git gives "/r" HEAD "c1" and
# the content "t1"; claude-code completes, its cost 1. runstore keeps:
# - "20261017T090000Z-aaaaaa", a call started 2026-10-17 09:00 UTC, its
#   cost 50;
# - "20261019T200000Z-bbbbbb", a call started 2026-10-19 20:00 UTC, its
#   cost 5, the day before by the host's clock;
# - "20261019T220000Z-cccccc", a call started 2026-10-19 22:00 UTC, its
#   cost 12;
# - "20261020T050000Z-dddddd", calls of the costs 7, null, and 3 taken
#   by a reuse.

Feature: The composition keeps calls to the day's budget

  Scenario: A call is given the day's budget and spend
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then claude-code's turn is given the budget 1
    And runstore is read for the runs "20261019T200000Z-bbbbbb",
      "20261019T220000Z-cccccc" and "20261020T050000Z-dddddd" alone

  Scenario: A call is not made once the day is spent
    Given runstore keeps as well "20261020T060000Z-eeeeee", a call of
      the cost 1
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then claude-code is given no turn, and git is asked no admission
    And the result is failed, class "budget_exhausted", the reason "the
      daily budget 20 is spent: 20", and it exits 1
    And the record holds the call failed, "budget_exhausted", its inputs
      q=why

  Scenario: A workflow's later step stops once its earlier one spent the
    day
    Given a workflow "two": the step "a", then "b", each of the process
      "ask" on "claude-opus" given the param q
    When "agister run two --param q=why" runs in "/r"
    Then claude-code is given one turn, for "a"
    And the run ends failed, class "budget_exhausted", "b" failed with
      the reason "the daily budget 20 is spent: 20"

  Scenario: No budget file reads no runs
    Given home holds no budget file
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then claude-code's turn is given no budget, and runstore is read for
      no run

  Scenario: A budget that is a problem refuses the run, and check reports
    it
    Given home's budget file "daily: {cost: 0}"
    When "agister check" runs in "/r"
    Then it reports the problem of "budget.yaml" at "daily.cost": it is
      more than zero, and exits 1
    And "agister run --process ask --agent claude-opus --param q=why"
      refuses before anything runs, naming the same problem
