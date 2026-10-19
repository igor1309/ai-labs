# core/admit, a call continuing a session (docs/run-implementation.md,
# "A binding continuing a session"; ADR-004, rule 5): admitted only where
# the worktree is as the session's latest call left it. Spies answer the
# worktree's facts, the hold and the call (ADR-009, rule 1).

Feature: A call continuing a session finds the worktree as it was left

  Scenario Outline: The worktree is checked against what was left
    Given the worktree's HEAD is "c1", its content "t1", and it is
      <state>
    And a call continuing a session whose latest call left HEAD <head>
      and the content <content>, its process <declares>
    When the call is admitted
    Then it <ends>

    Examples:
      | head | content | state     | declares              | ends                                                                 |
      | "c1" | "t1"    | clean     | declares nothing      | is admitted                                                          |
      | "c1" | "t1"    | not clean | asks a clean worktree | is admitted                                                          |
      | "c2" | "t1"    | clean     | declares nothing      | is refused: the worktree is not as the session's latest call left it |
      | "c1" | "t2"    | clean     | declares nothing      | is refused: the worktree is not as the session's latest call left it |
      | "c1" | empty   | clean     | declares nothing      | is refused: the worktree is not as the session's latest call left it |

  Scenario: A pin is checked first
    Given HEAD is "c1", and a call pinning the input "rev" of "c2" and
      continuing a session whose latest call left HEAD "c3"
    When the call is admitted
    Then it is refused: HEAD is "c1", not the pinned "c2"

  Scenario: A call refused so takes no hold and starts nothing
    Given a call continuing a session whose latest call left HEAD "c2",
      and HEAD is "c1"
    When the call is made through admit
    Then it ends failed, class "refused", no hold is taken, its turn is
      not made, and the port is told nothing
