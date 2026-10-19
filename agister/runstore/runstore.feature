# runstore, a wrapper (docs/run-implementation.md, "Records",
# "Continuation", "Runs", "A call's changes", "Definitions" and "A
# definition's bytes"; ADR-001, "Runs"): runs kept under a folder, each
# a folder of its id.
# Contract tests against real files, in a temporary folder (ADR-009, rule 3).

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

  Scenario Outline: A run is exported, its files copied under its id
    Given the run "x" kept, <kept>
    When "x" is exported to "out", <out>
    Then "out/x" holds <holds>, each as kept

    Examples:
      | kept                                                | out                         | holds                               |
      | its record and events written                       | not yet made                | "record.json" and "events.jsonl"    |
      | its record alone written                            | not yet made                | "record.json" alone                 |
      | its record and a patch written                      | not yet made                | "record.json" and "patches/a.patch" |
      | its record and the bytes of the digest "d1" written | not yet made                | "record.json" and "definitions/d1"  |
      | its record and events written                       | "out/x" an older copy of it | "record.json" and "events.jsonl"    |

  Scenario: A run not kept is not exported
    When "x" is exported to "out", no run "x" kept
    Then it gives an error, and "out" holds nothing

  Scenario: A call's patch is written whole under its run
    Given runstore over the folder "runs"
    When the patch "p1" of the step "a" of the run "x" is written, then
      "p2"
    Then it gives "x/patches/a.patch", and "runs/x/patches" holds
      "a.patch" alone, "p2" whole

  Scenario: A patch is given back by its path
    Given the patch "p1" of the step "a" of the run "x" written
    When the patch "x/patches/a.patch" is asked
    Then it gives "p1"

  Scenario: A call's definitions are written and given back
    Given runstore over the folder "runs"
    When the record of the run "x" is written, its call "a" holding the
      process "p", its home file "/h/p.yaml", digest "d1"
    Then "runs/x/record.json"'s call holds "definitions": the kind
      "process", the name "p" and that file, given back by "x"

  Scenario: A definition's bytes are written whole by their digest
    Given runstore over the folder "runs"
    When the bytes "b1" of the digest "d1" of the run "x" are written,
      then again
    Then "runs/x/definitions" holds "d1" alone, "b1" whole
