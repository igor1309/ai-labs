# cmd/agister, the run (docs/run-implementation.md, "The first run";
# ADR-001, "Starting a run"): cli's run answered from resolve and core,
# with spies in place of the wrappers (ADR-009, rule 4): the settings,
# home's as shipped with a bash process "say" whose prompt is the script
# "echo \"$what\"" and its input "what" from the param "what"; a git,
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
      | declares                                    | agent       | what                             |
      | as it is                                    | claude-opus | the runtime "claude-code"'s turn |
      | an input "b" from the source "git.revision" | bash        | the source "git.revision"        |
      | the input "what" with the form "goal"       | bash        | the brief form of "what"         |
      | a workspace revision from inputs.what       | bash        | the workspace's revision         |
      | a workspace clean                           | bash        | the workspace's clean            |
      | the stale limit no_event 1m                 | bash        | the staleness limit              |
      | a recovery of 1 resume                      | bash        | the recovery                     |
      | an instruction "think"                      | bash        | the instruction on bash          |
      | the guidance "g"                            | bash        | the guidance on bash             |

  Scenario: A workflow with an item that is not a step is refused
    When "agister run code_review --param goal=g" runs in "/r"
    Then it prints to stderr that the item "reviews", a parallel, is not
      run yet, nothing runs, and it exits 1

  Scenario: A step reaches core with its process's time limit
    Given the process "say" has the time limit 1s
    When the run of "say" on "bash" is built
    Then core's step has the time limit 1s

  Scenario: A signal to Agister cancels the run
    Given bash has started the script and not ended
    When the signal source gives SIGINT
    Then the turn's context is ended, and it prints the result,
      interrupted, class "cancelled", and exits 1
