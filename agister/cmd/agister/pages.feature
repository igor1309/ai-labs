# The composition's answer to pages' runs port: a spy in place of the run
# store (ADR-009); the store's formats are runstore's own tests.

Feature: The composition answers pages from the run store

  Scenario: A snapshot is mapped to pages' run
    Given the store's snapshot of a "code_review" run, ended completed
    And it has the call "implement" and the child "tests_debate"
    When pages reads the run
    Then it has its start, end, workflow, status, calls and child

  Scenario: A run's state is the state agister status gives
    Given the store's snapshot of an unfinished run whose owner is gone
    When pages reads the run
    Then its status is the one "agister status" prints: lost

  Scenario: A run the store cannot read is an error of that run
    Given the store fails on the snapshot of "R1"
    When pages reads "R1"
    Then the port gives that error

  Scenario: A run the store does not keep is not found
    Given the store keeps no run "R9"
    When pages reads "R9"
    Then the port gives ErrNotFound

  Scenario: agister pages serves until its context ends
    When "agister pages --no-open --addr 127.0.0.1:0" runs
    Then it prints its address and answers "/api/runs"
    And it exits 0 when its context is cancelled
