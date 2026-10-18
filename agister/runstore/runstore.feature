# runstore, a wrapper (docs/run-implementation.md, "Records",
# "Continuation" and "Runs"; ADR-001, "Runs"): runs kept under a folder,
# each a folder of its id. Contract tests against real files, in a temporary
# folder (ADR-009, rule 3).

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

  Scenario: The runs kept are given in name order
    Given the records of the runs "20261017T071618Z-55fd36" and
      "20261016T090000Z-0a0b0c" written
    When the runs kept are asked
    Then they are "20261016T090000Z-0a0b0c", then
      "20261017T071618Z-55fd36"

  Scenario: A run is exported, its files copied under its id
    Given the run "x" kept, its record and events written
    When "x" is exported to "out", not yet made
    Then "out/x" holds "record.json" and "events.jsonl", each as kept

  Scenario Outline: An export that cannot be made copies nothing
    Given <given>
    When "x" is exported to "out"
    Then it gives an error, and "out" holds nothing new

    Examples:
      | given                                 |
      | no run "x" kept                       |
      | the run "x" kept, and "out/x" present |
