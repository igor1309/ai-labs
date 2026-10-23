Feature: Build a skeleton: the puzzle in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, the
  puzzle stands upright: the bar across the top, with BACK, HOME and
  MUSEUM as their symbols, the board under it as wide as the screen
  lets it be, and the tray of bones under the board, its spots as large
  as its room allows. The rest is as skeleton-assembly.feature tells. A
  tall-narrow window keeps the picture asking to turn or widen
  (window-shape.feature).

  Scenario Outline: The puzzle stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I start a skeleton at <level>
    Then I see no picture asking to turn sideways or to make the window wider
    And the board stands over the tray, as wide as the screen, with room under it for every bone's spot

    Examples:
      | width | height | level          |
      | 744   | 1133   | Hatchling      |
      | 820   | 1180   | Explorer       |
      | 600   | 1000   | Paleontologist |

  Scenario: Bones fit upright as they do sideways
    Given a window of 820 by 1180 CSS pixels on a puzzle
    When I drag each bone to its home on the board
    Then each one fits, and the skeleton is finished

  Scenario: The puzzle glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on a puzzle
    When the window becomes 820 by 1180 CSS pixels
    Then the board and the tray glide to their new places
    And a bone held as it turns goes back to the tray
