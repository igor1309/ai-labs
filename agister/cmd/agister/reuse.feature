# cmd/agister, a reuse (docs/run-implementation.md, "Reuse"; ADR-001,
# invariant 8): a run taking an earlier run's completed calls, with spies in
# place of the wrappers (ADR-009, rule 4). Settings as record.feature
# gives them, with a workflow "review": a parallel "reviews" of the steps
# "a" and "b", each of the process "ask" on "codex-sol-61" given the
# param q, then "judge", of the process "rule" on "claude-opus", given
# the parallel's outputs. runstore keeps the run "R1" of "review" in
# "/r", q "why": "a" and "b" completed, their root "/r", HEAD "c1" and
# content "t1", "judge" failed, each call holding the definitions and
# environment this run's call of its step has; git gives "/r" HEAD "c1"
# and content "t1".

Feature: The composition reuses an earlier run's completed calls

  Scenario: A judge that failed runs alone on the reviews kept
    When "agister run review --param q=why --reuse R1" runs in "/r"
    Then codex is given no turn, and claude-code's turn is given the
      outputs "a" and "b" completed with in "R1"
    And the record's request reuses "R1", its calls "a" and "b" reuse
      "R1/a" and "R1/b" with their results as recorded, and "judge" is
      made
    And the progress shows "· a: reused R1/a" and "· b: reused R1/b"
    And the result's cost and usage are the judge's alone, a count it
      does not report null

  Scenario: A continuation goes on from a call made, not one reused
    Given runstore keeps "R2", which continued "R1/a" as "R2/a", its
      session that of "R1/a" and content "t2"; and "R3", which reused
      "R1", its call "R3/a" reusing "R1/a"; git gives "/r" content "t1"
    When "agister run --process ask --agent codex-sol-61 --param q=why
      --continue R2" runs in "/r"
    Then it prints to stderr that the worktree is not as "R2/a" left
      it, nothing runs, and it exits 1

  Scenario: A call that failed is made again
    Given in "R1", "b" failed, class "rate_limited"
    When "agister run review --param q=why --reuse R1" runs in "/r"
    Then codex is given one turn, for "b", and "a" reuses "R1/a"

  Scenario Outline: A call given something else is made
    Given <given>
    When "agister run review --param q=<q> --reuse R1" runs in "/r"
    Then codex is given turns for "a" and "b", and no call reuses

    Examples:
      | given                           | q     |
      | nothing more                    | other |
      | git gives "/r" HEAD "c2"        | why   |
      | git gives "/r" the content "t2" | why   |

  Scenario: A reuse of a run whose request was another is refused
    When "agister run --process ask --agent codex-sol-61 --param q=why
      --reuse R1" runs in "/r"
    Then it prints to stderr that "R1" ran the workflow "review",
      nothing runs, no record is written, and it exits 1

  Scenario: A reuse of a run not kept is refused
    When "agister run review --param q=why --reuse R9" runs in "/r"
    Then it prints to stderr that no run "R9" is kept, nothing runs, no
      record is written, and it exits 1
