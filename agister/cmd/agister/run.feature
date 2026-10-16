# cmd/agister, the run (docs/run-implementation.md, "The first run";
# ADR-001, "Starting a run"): cli's run answered from resolve and core,
# with spies in place of the wrappers (ADR-009, rule 4): the settings,
# home's as shipped with a bash process "say" whose prompt is the script
# "echo \"$what\"" and its input "what" from the param "what"; a git,
# whose worktree root of "/r" and below is "/r"; and the bash wrapper.

Feature: The composition runs a request

  Scenario: A step requested alone runs on bash
    When "agister run --process say --agent bash --param what=hi" runs
      in "/r/a"
    Then bash runs the script "echo \"$what\"" in "/r", its environment
      Agister's and what=hi
    And it prints the result, completed, its output the exit code and
      stdout "hi"

  Scenario: A request that does not resolve runs nothing
    When "agister run --process say --agent claude-opus" runs in "/r"
    Then it prints the refusal to stderr, nothing runs, and it exits 1

  Scenario: Outside a git worktree the request is refused
    When "agister run --process say --agent bash --param what=hi" runs
      in "/elsewhere"
    Then it prints to stderr that "/elsewhere" is in no git worktree,
      nothing runs, and it exits 1

  Scenario Outline: What this slice does not run is refused before anything
    When "agister run <request>" runs in "/r"
    Then it prints to stderr <why>, nothing runs, and it exits 1

    Examples:
      | request                                             | why                                                 |
      | --process review --agent claude-opus --param goal=g | that the runtime "claude-code" has no turn yet      |
      | code_review --param goal=g                          | that the item "reviews", a parallel, is not run yet |

  Scenario: A step's time limit is its process's
    Given the process "say" has the time limit 1s, and bash does not end
    When "agister run --process say --agent bash --param what=hi" runs
    Then it prints the result, interrupted, class "timeout", and exits 1
