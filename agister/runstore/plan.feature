# runstore, a wrapper (docs/run-implementation.md, "A call's plan";
# ADR-001, invariant 6): a call's permissions and environment in its
# run's record. Contract tests against real files, in a temporary folder
# (ADR-009, rule 3).

Feature: runstore keeps a call's plan

  Scenario: A call's permissions and environment are written and given
    back
    Given runstore over the folder "runs"
    When the record of the run "x" is written, its call "a" granted
      "repository.read", withheld "network", its environment A=1
    Then "runs/x/record.json"'s call holds "permissions" with those
      lists, each other list [], and "environment" [{"name": "A",
      "value": "1"}], given back by "x"

  Scenario: An entry from before is read as having none
    Given "runs/x/record.json" holds a call with no field "permissions"
      and no field "environment"
    When the record of "x" is asked
    Then its call's permissions and environment are empty
