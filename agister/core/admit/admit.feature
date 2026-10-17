# core/admit (docs/run-implementation.md, "A step in a held worktree";
# ADR-004, rules 2 and 3): a call admitted before it starts, made
# through admit. Spies answer the worktree's facts, the hold, the call and
# the port told an admitted call's worktree (ADR-009, rule 1);
# "Records" for what it tells.

Feature: A call is admitted before it starts

  Scenario Outline: A call's process decides what is checked
    Given the worktree's HEAD is "c1", it is <state>, and its hold
      <hold>
    And a call whose process <declares>
    When the call is admitted
    Then it <ends>

    Examples:
      | declares                     | state     | hold            | ends                                             |
      | declares nothing             | clean     | is free         | is admitted, holding the worktree shared         |
      | declares read-write access   | clean     | is free         | is admitted, holding the worktree alone          |
      | pins the input "rev" of "c1" | clean     | is free         | is admitted                                      |
      | pins the input "rev" of "c2" | clean     | is free         | is refused: HEAD is "c1", not the pinned "c2"    |
      | pins the param "what"        | clean     | is free         | is refused: a pin from a param is not run yet    |
      | asks a clean worktree        | not clean | is free         | is refused: the worktree is not clean            |
      | declares nothing             | not clean | is free         | is admitted                                      |
      | declares read-write access   | clean     | cannot be taken | is refused: the worktree is held by another call |

  # "the input" is a git.revision input, which gives a commit.

  Scenario: A refused call takes no hold and starts nothing
    Given a call that pins the input "rev" of "c2", and HEAD is "c1"
    When the call is made through admit
    Then it ends failed, class "refused", no hold is taken, and its turn
      is not made

  Scenario Outline: The hold is released when the call ends
    Given an admitted call, whose turn <ends>
    When the call ends
    Then its hold is released

    Examples:
      | ends         |
      | completes    |
      | fails        |
      | is cancelled |

  Scenario Outline: An admitted call's worktree is told, read under its hold
    Given the worktree's HEAD is "c1" and its content "t1" until the
      call ends, then "t2"
    And an admitted call, whose turn <ends>
    When the call ends
    Then the port is told HEAD "c1" and the content "t2", read before
      the hold is released

    Examples:
      | ends         |
      | completes    |
      | is cancelled |

  Scenario: A refused call's worktree is not told
    Given a call that asks a clean worktree, and it is not clean
    When the call is made through admit
    Then the port is told nothing

  Scenario: A fact that cannot be read is told empty
    Given the worktree's HEAD cannot be read, and the call pins nothing
    When the call is made through admit
    Then the call is made, and the port is told HEAD empty
