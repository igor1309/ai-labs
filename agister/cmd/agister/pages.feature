# The composition's answer to pages' runs port, over a real run store in a
# temporary folder, and the command that serves it.

Feature: The composition answers pages from the run store

  Scenario: A run kept only as a log is shown
    Given a run with run.jsonl and no record.json, ended completed
    When pages lists the runs
    Then the run has its start, end, workflow and status

  Scenario: A run kept as record.json is shown
    Given a run with record.json in the current schema, ended failed
    When pages lists the runs
    Then the run has its start, end, process and status

  Scenario: A run's state is the state agister status gives
    Given an unfinished run whose owner is gone
    When pages lists the runs
    Then its status is the one "agister status" prints: lost

  Scenario: A run's log that does not parse is left out
    Given a run whose run.jsonl is not JSON, and one that is
    When pages lists the runs
    Then the good run is shown and 1 is left out

  Scenario: agister pages serves until its context ends
    When "agister pages --no-open --addr 127.0.0.1:0" runs
    Then it prints its address and answers "/api/runs"
    And it exits 0 when its context is cancelled
