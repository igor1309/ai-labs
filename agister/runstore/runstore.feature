# runstore, a wrapper (docs/run-implementation.md, "Records"; ADR-001,
# "Runs"): runs kept under a folder, each a folder of its id. Contract
# tests against real files, in a temporary folder (ADR-009, rule 3).

Feature: runstore keeps runs

  Scenario: A record written is given back by its run's id
    Given runstore over the folder "runs"
    When the record of the run "x" is written, then written again
    Then "runs/x/record.json" holds the second, given back by "x"

  Scenario: A record is written whole, no temporary file left
    Given the record of the run "x" written once
    When it is written again
    Then "runs/x" holds "record.json" alone, the second record whole

  Scenario: Appends side by side are each a whole line
    When 50 events are appended to the run "x" at once
    Then "runs/x/events.jsonl" holds 50 lines, each one event whole

  Scenario: Events are appended, a line each, in order
    When the events "a", "b", then "c" are appended to the run "x"
    Then "runs/x/events.jsonl" holds three lines, "a", "b", then "c"

  Scenario: A run not kept is an error
    When the record of the run "y" is asked
    Then it gives an error that is, or wraps, fs.ErrNotExist
