# cmd/agister, the run (docs/run-implementation.md, "The first run" and
# "A step on a model runtime", "Inputs and progress", "A step in a
# held worktree" and "Parallel steps and a join";
# ADR-001, "Starting a run"): cli's run answered from resolve and core,
# with spies in place of the wrappers (ADR-009, rule 4): the settings,
# home's as shipped with a bash process "say" whose prompt is the script
# "echo \"$what\"" and its input "what" from the param "what", and a
# workflow "pair" of two "say" steps, "a" given what=hi and "b" given
# what from steps.a.outputs.stdout.head, its output "said" from
# steps.b.outputs.stdout.head; a git,
# whose worktree root of "/r" and below is "/r"; the bash wrapper; and a
# signal source.

Feature: The composition runs a request

  Scenario: A step requested alone runs on bash
    When "agister run --process say --agent bash --param what=hi" runs
      in "/r/a"
    Then bash runs the script "echo \"$what\"" in "/r", its environment
      Agister's and what=hi
    And it prints the result, completed, its output the exit code and
      stdout "hi", and its warnings the plan's

  Scenario: A named workflow runs its steps in order, bound
    When "agister run pair" runs in "/r"
    Then bash runs "echo \"$what\"" with what=hi, then with what=hi
      followed by a newline, the first's stdout
    And it prints the result, completed, its output "said"

  Scenario: A request that does not resolve runs nothing
    When "agister run --process nope --agent bash" runs in "/r"
    Then it prints the refusal to stderr, nothing runs, and it exits 1

  Scenario: Outside a git worktree the request is refused
    When "agister run --process say --agent bash --param what=hi" runs
      in "/elsewhere"
    Then it prints to stderr that "/elsewhere" is in no git worktree,
      nothing runs, and it exits 1

  Scenario Outline: What this slice does not run is refused before anything
    Given the process "say" <declares>
    When "agister run --process say --agent <agent> --param what=hi" runs
    Then it prints to stderr that <what> is not run yet, nothing runs,
      and it exits 1

    Examples:
      | declares                                     | agent       | what                                  |
      | as it is                                     | pi-m3       | the runtime "pi"'s turn               |
      | the cost limit 1                             | claude-opus | the cost limit                        |
      | an input "prompt" from the param "what"      | claude-opus | the input "prompt", a document's name |
      | an input "b" from the source "git.diff"      | bash        | the source "git.diff"                 |
      | the stale limit no_event 1m                  | bash        | the staleness limit on bash           |
      | an instruction "think"                       | bash        | the instruction on bash               |
      | the guidance "g", a prompt the settings hold | bash        | the guidance on bash                  |

  Scenario Outline: What a parallel does not run yet is refused
    Given the workflow "w" with the parallel "p" <holding>
    When "agister run w" runs in "/r"
    Then it prints to stderr that <what> is not run yet, nothing runs,
      and it exits 1

    Examples:
      | holding                                 | what                                      |
      | of "say" and a branch "b"               | the item "b", a branch,                   |
      | of two "say", read by steps.p.outputs.x | a field within the parallel "p"'s outputs |

  Scenario: A step reaches core with its process's time limit, as layered
    Given home's process "say" has the time limit 1m, and the
      repository's "say" extends it with the time limit 1s
    When the run of "say" on "bash" is built
    Then core's step has the time limit 1s

  Scenario Outline: A signal to Agister cancels the run
    Given bash has started the script and not ended
    When the signal source gives <signal>
    Then the turn's context is ended, and it prints the result,
      interrupted, class "cancelled", and exits 1

    Examples:
      | signal  |
      | SIGINT  |
      | SIGTERM |
      | SIGHUP  |
      | SIGQUIT |
