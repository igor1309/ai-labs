# cmd/agister, a branch and a repeat run: Audelin's repair loop, built
# from settings and run on spies in place of the wrappers.
# Settings: the repository's workflow "tested": the step "build" of
# "implement" on "codex-sol-61"; the step "test" of "tests" on "bash";
# then the branch "fix" of the arm "passed", if steps.test.outputs.
# exit_code equals 0, the step "done" of "pass" on "bash", and the
# default "repair", a repeat: its state "code" and "tail" from "test"'s
# exit code and stdout's tail, its body the step "repair_tests" of
# "repair" on "codex-sol-61", continuing steps.build.session, binding
# "failure" from state.tail, then the step "retest" of "tests" on
# "bash"; its next state from "retest"'s; until state.code equals 0; max
# 3. The arm "passed" maps "stopped" the text "none", "repair" from
# steps.repair.outputs.stopped; the workflow's output "stopped" reads
# the branch's.

Feature: A workflow's branch and repeat run

  Scenario Outline: The tests pass, or are repaired, or the loop gives up
    Given bash's test script exits <codes>, in turn
    When "agister run tested --param brief=b.md" runs in "/r"
    Then the calls made are <calls>
    And the result is <status>, its output "stopped" <stopped>

    Examples:
      | codes      | calls                                                                                     | status    | stopped |
      | 0          | build, test, done                                                                         | completed | "none"  |
      | 1, 0       | build, test, repair_tests/1, retest/1                                                     | completed | "until" |
      | 1, 1, 1, 1 | build, test, repair_tests/1, retest/1, repair_tests/2, retest/2, repair_tests/3, retest/3 | completed | "max"   |

  Scenario: Each repair continues the builder's session, from its latest call
    Given bash's test script exits 1, 1, then 0
    When "agister run tested --param brief=b.md" runs in "/r"
    Then "repair_tests/1" continues the session of "build", and
      "repair_tests/2" continues the same session, from "repair_tests/1"

  Scenario: The record keeps each call by its pass, the arm and the stop
    Given bash's test script exits 1, then 0
    When "agister run tested --param brief=b.md" runs in "/r"
    Then the record's calls are "<run id>/build", "<run id>/test",
      "<run id>/repair_tests/1" and "<run id>/retest/1"
    And events.jsonl has the branch "fix" taking "repair", the arm
      "passed"'s condition false, read 1; pass 1 of "repair" leaving the
      state code 0; and "repair" stopping "until" after 1 pass

  Scenario: Progress names a step in a repeat by its pass
    Given bash's test script exits 1, then 0
    When "agister run tested --param brief=b.md" runs in "/r"
    Then stderr has a line "repair_tests/1" started on "codex-sol-61",
      a line the branch "fix" took "repair", a line "repair" ended pass 1,
      and a line "repair" stopped "until" after 1 pass

  Scenario: A run reusing an earlier one does not take a later pass's call for an earlier one
    Given a run of "tested" whose test script exited 1, 1, then 0, its
      spies changing no file, so every call left the worktree as it found it
    When "agister run tested --param brief=b.md --reuse <that run>" runs
      in "/r", the worktree as that run left it, the script now exiting 0
    Then "test" takes the earlier "test", "retest/1" the earlier
      "retest/1", exit 1, and "retest/2" the earlier "retest/2", exit 0,
      so the repeat still runs 2 passes
    And "build", "repair_tests/1" and "repair_tests/2", a session's
      chain, are made anew

  Scenario: A reused run's retest runs anew where a repair changed the worktree
    Given a run of "tested" whose test script exited 1, then 0
    When it is reused, and the new "repair_tests/1" changes a file
    Then "retest/1" runs anew, exit 0

  Scenario: Check passes the workflow
    When "agister check" runs in "/r"
    Then it refuses nothing of the workflow "tested"
