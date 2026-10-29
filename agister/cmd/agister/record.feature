# cmd/agister, records (docs/run-implementation.md, "Records"; ADR-001,
# invariants 6 and 7): a run's record, with spies in place of the
# wrappers (ADR-009, rule 4). Settings: as run.feature gives them, with
# the repository's process "ask" on a model, as model.feature gives it; the
# clock reads 2026-10-17 07:16:18 UTC at the start, randomness gives
# "55fd36", and git gives "/r" HEAD "c1" and its content "t1".

Feature: The composition records each run

  Scenario: A run's id is printed, and its record kept under home's runs
    When "agister run pair" runs in "/r"
    Then it prints the result with run_id "20261017T071618Z-55fd36"
    And runstore is given, under home's "runs", the record of that id,
      schema "agister.record/v1alpha1", its request the workflow "pair"
      in "/r", and its result as printed

  Scenario: Each call is recorded, with its worktree and result
    Given claude-code completes, its session "s1"
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record holds one call, id "20261017T071618Z-55fd36/ask",
      its step "ask", process "ask" and agent "claude-opus", the root
      "/r", HEAD "c1", the content "t1", and its result, completed,
      its session "s1"

  Scenario: A record is running until the run ends, its ended calls kept
    Given the steps of "pair", "a" completed and "b" started, not ended
    When "agister run pair" runs in "/r"
    Then runstore was last given, while "b" runs, the record "running",
      its result null, holding "a"'s call completed

  Scenario: Each event reaches runstore, in order
    When "agister run pair" runs in "/r"
    Then runstore is given the events, in order: "a" started, "a"
      ended, "b" started, "b" ended, each with its time

  Scenario: A refusal by admission is recorded
    Given git gives "/r" not clean, and names "HEAD" the commit "c1";
      the file "/r/s.md" holds a brief of home's form "step" whose goal
      names a file "/r" holds
    When "agister run --process implement --agent claude-opus --param
      brief=s.md" runs in "/r"
    Then the record holds the run failed, class "refused", the reason
      that the worktree is not clean, its HEAD and content empty

  Scenario: Calls side by side that end together are both kept
    Given home's code_review as review.feature gives it, two reviews
      ending at once
    When "agister run code_review --param goal=g.md" runs in "/r"
    Then every record runstore is given after both have ended holds
      both, and the last holds each of the six calls once

  Scenario Outline: What is refused before anything runs is not recorded
    When "agister run <request>" runs in "<dir>"
    Then runstore is given nothing

    Examples:
      | request                     | dir  |
      | --process nope --agent bash | /r   |
      | --process say --agent pi-m3 | /r   |
      | pair                        | /out |

  Scenario Outline: A record that cannot be written
    Given runstore fails <which> write
    When "agister run pair" runs in "/r"
    Then <then>

    Examples:
      | which      | then                                                      |
      | the first  | it prints the failure to stderr, nothing runs, it exits 1 |
      | the second | the run fails with class "persistence"        |
