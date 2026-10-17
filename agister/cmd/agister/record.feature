# cmd/agister, records (docs/run-implementation.md, "Records"; ADR-001,
# invariants 6 and 7): a run's record, with spies in place of the
# wrappers (ADR-009, rule 4). Settings: as run.feature gives them, with
# the repository's process "ask" on a model, as model.feature gives it; the
# clock reads 2026-10-17 07:16:18 UTC at the start, randomness gives
# "55fd36", and git gives "/r" HEAD "c1" and the content "t1" then "t2".

Feature: The composition records each run

  Scenario: A run's id is printed, and its record kept under home's runs
    When "agister run pair" runs in "/r"
    Then it prints the result with run_id "20261017T071618Z-55fd36"
    And runstore holds, under home's "runs", the record of that id,
      schema "agister.record/v1alpha1", its request the workflow "pair"
      in "/r", and its result as printed

  Scenario: Each call is recorded, with its worktree and session
    Given claude-code completes, its session "s1"
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record holds one call, id "20261017T071618Z-55fd36/ask",
      its step "ask", process "ask" and agent "claude-opus", the root
      "/r", HEAD "c1", its content at the end "t1", its session "s1",
      completed

  Scenario: A record is written lost before anything runs
    Given bash has started the script and not ended
    When the record is read
    Then its status is "lost", and it holds no result

  Scenario: Each event is a line, in order
    When "agister run pair" runs in "/r"
    Then events.jsonl holds, in order: "a" started, "a" ended, "b"
      started, "b" ended, each with its time

  Scenario: A refusal by admission is recorded
    Given git gives "/r" not clean, and the file "/r/s.md" holds a brief
      of home's form "step"
    When "agister run --process implement --agent claude-opus --param
      brief=s.md" runs in "/r"
    Then the record holds the run failed, class "refused"

  Scenario: A request that does not resolve is not recorded
    When "agister run --process nope --agent bash" runs in "/r"
    Then runstore is given nothing
