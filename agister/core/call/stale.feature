# core/call, a stale turn (docs/run-implementation.md, "A step in a held
# worktree"; ADR-006, rule 2). Spies answer the runtime protocol and the
# watch (ADR-009, rule 1).

Feature: A stale turn ends its call

  Scenario Outline: The call ends as what went stale says
    Given a model step whose turn is running, and the watch reports
      <stale>
    When the call ends
    Then the turn's context is ended, and the call ends <status>,
      class "<class>", its reason <reason>

    Examples:
      | stale                                 | status      | class            | reason                                |
      | the tool call "Bash" repeated 3 times | failed      | budget_exhausted | the tool call "Bash" repeated 3 times |
      | the tool command "Bash" ran over 15m  | interrupted | timeout          | the tool command "Bash" ran over 15m  |
      | no event for 21m                      | interrupted | timeout          | no event for 21m                      |

  Scenario: A process with no staleness limit is not watched
    Given a model step whose process sets no staleness limit
    When the call is made
    Then no watch is started
