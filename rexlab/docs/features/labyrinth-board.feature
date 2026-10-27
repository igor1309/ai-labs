Feature: Guide a baby dinosaur home
  The global age level chooses Hatchling, Explorer or Paleontologist.
  Explorer is the default. A level switch is available on the result.
  A per-game choice follows the shared override and reset rules.
  Each round has one fixed maze, with no timer, lives or moving threats.

  Scenario: A clear board
    Given a labyrinth round starts
    Then the whole maze is visible in iPad landscape at 1024 by 670, 1024 by 690, 1024 by 768, 1133 by 670 and 1133 by 744, including all controls
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
    And windows below the shared landscape minimum of 1024 by 670 can scroll rather than shrinking path cells below 48 pixels

  Scenario Outline: Difficulty requires route decisions
    Given the round is played at <level>
    Then its board has <columns> columns and <rows> rows
    And its shortest solution has at least <steps> single-space moves
    And at least <decisions> junctions on the solution have a wrong branch
    And at least <detours> of those wrong branches run for 4 or more moves before ending
    And the board is selected from at least 6 qualifying layouts at this level
    And no route or correct direction is marked unless HINT is explicitly tapped
    And footprints indicate all legal adjacent spaces equally, including wrong turns

    Examples:
      | level          | columns | rows | steps | decisions | detours |
      | Hatchling      | 9       | 7    | 14    | 2         | 1       |
      | Explorer       | 15      | 9    | 32    | 4         | 3       |
      | Paleontologist | 17      | 11   | 50    | 6         | 4       |

  Scenario: Complexity is checked before a layout can ship
    Then automated graph checks prove the length, junction and detour requirements for every layout
    And every layout is connected and solvable
    And retrying or asking for help never moves the child to an easier level
    And the current simple maze is retained only among Hatchling layouts if it qualifies
