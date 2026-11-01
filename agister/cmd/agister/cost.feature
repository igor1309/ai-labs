# cmd/agister, a call's cost (docs/run-implementation.md, "A call's
# cost"; ADR-004, rule 7; ADR-012, rule 5), with spies in place of the
# wrappers (ADR-009, rule 4). Settings as record.feature gives them, the
# repository's process "ask" as model.feature gives it, but declaring the
# cost limit 1. The run's id is "R"; git gives "/r" HEAD "c1" and the
# content "t1"; claude-code completes, its session "s1", its cost 0.25
# and its session's cost 0.25, unless a scenario says otherwise.

Feature: The composition keeps a call to its cost limit

  Scenario: A step on claude-code is given its process's cost limit
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then claude-code's turn is given the budget 1, and the session's
      cost before 0
    And the record's call has the cost 0.25 and "session_cost" 0.25

  Scenario: A continuation is given the session's cost from the record
    Given runstore keeps the run "R1", one call, "R1/ask", of the process
      "ask" on "claude-opus", its root "/r", HEAD "c1", content "t1",
      session "s1" and "session_cost" 1.25; and claude-code reports
      the session's cost 1.5
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then claude-code's turn is given the session "s1" and the session's
      cost before 1.25
    And the record's call has the cost 0.25 and "session_cost" 1.5

  Scenario: A continuation of an entry from before has its cost unknown
    Given runstore keeps the run "R1" as above, but its call with no
      "session_cost"; and claude-code reports the session's cost 1.5
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then claude-code's turn is given the session "s1" and an unknown
      session's cost before
    And the record's call has "session_cost" 1.5

  Scenario: A step continuing a session in the run is given its cost
    Given a workflow "talk": the step "first", then "second", continuing
      "first"'s session, each of the process "ask" on "claude-opus"
      given the param q; and claude-code's turn for "first" reports the
      session's cost 0.5
    When "agister run talk --param q=why" runs in "/r"
    Then claude-code's turn for "second" is given the session "s1" and
      the session's cost before 0.5

  Scenario: A limit on a runtime that reports no cost spends nothing
    Given the process "say" on bash declares the cost limit 1
    When "agister run --process say --agent bash --param what=hi" runs
      in "/r"
    Then bash's program runs, and the result's warnings hold "the
      runtime bash reports no cost: the cost limit 1 spends nothing"

  Scenario: A limit on codex is kept on the cost it reports
    Given codex's turn fails at capacity, its thread "t1", its cost 1.5
      and its session's cost 1.5
    When "agister run --process ask --agent codex-sol-61 --param q=why"
      runs in "/r"
    Then codex is given one turn, and the result has no warning
    And it is failed, class "budget_exhausted", the reason "the cost
      limit 1 is spent: 1.5"
    And the record's call has the cost 1.5, "cost_source" "ccusage" and
      "session_cost" 1.5

  Scenario: A codex call whose cost is unknown says why
    Given codex completes, its cost unknown, why "ccusage could not price
      the thread t1: the program could not start"
    When "agister run --process ask --agent codex-sol-61 --param q=why"
      runs in "/r"
    Then the result's warnings hold "ccusage could not price the thread
      t1: the program could not start"
    And the record's call has the cost null and "cost_source" null
