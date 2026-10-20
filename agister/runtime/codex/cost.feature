# runtime/codex, a turn's cost and usage through ccusage
# (docs/run-implementation.md, "Codex's cost"; ADR-001, invariant 3). A
# spy answers in place of the supervisor, fed recorded lines (ADR-009,
# rule 3): codex's, then a lookup's, `ccusage codex session --json -O
# --id <thread>`, giving the thread's total cost and tokens to date.

Feature: The codex wrapper counts a turn's own cost

  Scenario: A turn's cost is the thread's after it
    Given codex completes the thread "t1"
    And a lookup gives the thread "t1" the cost 0.25
    When codex runs the message "m" with no session
    Then the supervisor runs codex, then "ccusage codex session --json
      -O --id t1" in the turn's directory with its environment
    And the reply's cost is 0.25, and its session's cost 0.25

  Scenario: A resumed turn's cost and usage are the thread's after it
    less before
    Given a lookup gives the thread "t1" the cost 1, the input 1000, the
      cache reads 600, the output 50 and the reasoning 20
    And codex resumes the thread "t1" and completes, its usage the input
      2500, the cached input 1500, the output 80 and the reasoning 30
    And a lookup then gives the thread "t1" the cost 1.25
    When codex runs the message "m" with the session "t1"
    Then the supervisor runs a lookup, codex, then a lookup
    And the reply's cost is 0.25, and its session's cost 1.25
    And its usage is the input 900, the cache reads 900, the output 30
      and the reasoning 10

  Scenario Outline: A lookup that fails leaves the cost unknown
    Given codex completes the thread "t1", its usage the input 100
    And the lookup <fails>
    When codex runs the message "m" with no session
    Then the reply completes, its cost unknown and its session's cost
      unknown, its usage the input 100

    Examples:
      | fails                                                    |
      | cannot start                                              |
      | is ended by SIGTERM                                       |
      | exits 1, "No Codex session found with ID: t1"            |
      | gives "not json"                                         |
      | gives an object with no "totalCost"                      |
      | gives the cost 0.25, its model "gpt-x" marked isFallback |

  Scenario: A lookup before that fails leaves the cost and usage unknown
    Given the lookup before cannot start
    And codex resumes the thread "t1" and completes, its usage the input
      2500
    And a lookup then gives the thread "t1" the cost 1.25
    When codex runs the message "m" with the session "t1"
    Then the reply's cost is unknown, and its session's cost 1.25
    And its usage is unknown

  Scenario: A turn at capacity is looked up as well
    Given codex's lines of thread.started "t1" and turn.failed "Selected
      model is at capacity"
    And a lookup gives the thread "t1" the cost 0.25
    When codex runs the message "m" with no session
    Then the reply fails, class "capacity", its cost 0.25

  Scenario: A cost or a count less than before is unknown
    Given a lookup gives the thread "t1" the cost 1 and the input 1000
    And codex resumes the thread "t1" and completes, its usage the input
      500 and the output 10
    And a lookup then gives the thread "t1" the cost 0.5
    When codex runs the message "m" with the session "t1"
    Then the reply's cost is unknown, and its session's cost 0.5
    And its input is unknown, and its output 10

  Scenario Outline: A turn with no reply or thread has no lookup after
    Given codex <ends>
    When codex runs the message "m" with no session
    Then the supervisor runs codex alone

    Examples:
      | ends                                   |
      | is ended by SIGTERM, its thread "t1"   |
      | completes with no thread.started event |
