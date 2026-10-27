Feature: Guide a baby dinosaur home
  The first release has one Hatchling mode, used at every global age level.
  Each round has one fixed maze, with no timer, lives or moving threats.

  Scenario: A clear board
    Given a labyrinth round starts
    Then the whole maze is visible in iPad landscape at 1024 by 768 and 1133 by 744
    And the baby and its larger parent use the same existing dinosaur picture
    And the parent is visibly marked as the goal
    And each path cell has a touch target at least 48 CSS pixels wide and high
    And adjacent legal moves are visibly indicated without relying only on colour
    And all child-facing words are capitalised in English and Russian
    And every labelled control has a symbol or picture

  Scenario: Move one space and backtrack
    When the child taps an orthogonally adjacent open path cell
    Then the baby moves exactly one space with shared motion timing
    And the previous space stays available for backtracking
    When the child taps a wall or a nonadjacent cell
    Then the baby stays where it is
    And no score is lost
    And the destination never causes automatic pathfinding movement

  Scenario: Optional help
    When the child taps the hint control
    Then only the next space on a route from the current position to the parent is highlighted
    And the baby does not move
    And using hints does not reduce the reward
    When the child makes a legal move
    Then the old hint clears

  Scenario: A maze worth exploring
    Then every shipped maze has a reachable goal and at least one branching dead end
    And there are at least three different maze layouts
    And the next round chooses a layout different from the previous round
    And all path cells are reachable from the start

  Scenario: Input and appearance
    Then the global double-tap filter applies without a per-button replacement
    And arrow keys move one legal space when the board has focus
    And controls are keyboard accessible with visible focus
    And light and dark themes keep paths, walls and controls distinct
    And reduced motion uses short fades rather than travel or bounce animation
    And smaller windows can scroll rather than shrinking path cells below 48 pixels
