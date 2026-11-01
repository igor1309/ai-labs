# core/admit, a call continuing a session (docs/run-implementation.md,
# "A binding continuing a session"; ADR-004, rule 5): admitted only where
# the worktree is as the session's latest call left it, its HEAD the
# one that call left ("A call's changes"). Spies answer the
# worktree's facts, the hold and the call (ADR-009, rule 1).

Feature: A call continuing a session finds the worktree as it was left

  Scenario Outline: The worktree is checked against what was left
    Given the worktree's HEAD is "c1" and its content "t1"
    And a call continuing a session whose latest call left HEAD
      <head> and the content <content>
    When the call is admitted
    Then it <ends>

    Examples:
      | head  | content | ends                                                                 |
      | "c1"  | "t1"    | is admitted                                                          |
      | "c2"  | "t1"    | is refused: HEAD is "c1", not the session's latest call's "c2"       |
      | "c1"  | "t2"    | is refused: the worktree is not as the session's latest call left it |
      | "c1"  | empty   | is refused: the worktree is not as the session's latest call left it |
      | empty | "t1"    | is refused: the worktree is not as the session's latest call left it |

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
