# pages' Runs and Compare endpoints (docs/pages-implementation.md). A spy
# answers the runs port in every test.

Feature: Pages shows the runs kept

  Scenario: The list is the newest runs first, at most the limit
    Given the port keeps the runs "R1", "R2", "R3", oldest first
    When "/api/runs?limit=2" is read
    Then the runs are "R3", "R2"
    And the total is 3

  Scenario: A run shows what it was asked and how it ended
    Given a run of "code_review", completed in 90 seconds at a cost of 1.50
    When "/api/runs" is read
    Then its row has that workflow, status, duration and cost

  Scenario: A run the port cannot read is left out and counted
    Given the runs "R1" and "R2", and the port fails on "R1"
    When "/api/runs" is read
    Then the runs are "R2"
    And 1 is left out

  Scenario Outline: A bad limit is a bad request
    When "/api/runs?limit=<limit>" is read
    Then the reply is 400

    Examples:
      | limit |
      | 0     |
      | x     |

  Scenario: One run shows its calls and child runs
    Given a run with the call "implement" and the child run "tests_debate"
    When "/api/runs/R1" is read
    Then the reply names both, each with its status

  Scenario: A run not kept is not found
    When "/api/runs/R9" is read
    Then the reply is 404

  Scenario: Compare tallies ended calls per process and agent
    Given "review" on "codex": completed 10s, completed 30s, failed 20s
    When "/api/runs/compare" is read
    Then the group has 3 runs, 2 completed and a median of 20s

  Scenario: A request addressed to another host is refused
    When "/api/runs" is read with the Host "evil.example"
    Then the reply is 403
