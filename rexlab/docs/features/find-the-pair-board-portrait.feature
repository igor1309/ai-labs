Feature: Find the pair: the board in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), find the pair's board
  stands upright: the bar on top, the board under it, centred, its grid
  turned on its side. The rest is as find-the-pair-board.feature and
  find-the-pair-levels.feature tell. A tall-narrow window keeps the
  picture asking to turn or widen (window-shape.feature).

  The grid turns on its side: a board of R rows and C columns stands in
  C rows and R columns, each card keeping its neighbours, so the top
  left card stays top left. The screen keeps its landscape padding top
  and bottom (40 and 48) and the bar's gap (28), and is 32 from each
  side; the cards stand 16 apart and keep their landscape shape, 3 wide
  to 3.2 tall. "The width" is the window's less its side insets and
  that padding (a scrollbar that takes room narrows it). The cards are
  as large as lets the board fit the width and the height under the bar,
  never under the board's floor (150 for Hatchling's climb, 130 for
  Explorer, 120 for Paleontologist); where the window leaves them less,
  the whole screen scrolls. The bar is one row of its landscape height:
  "BACK" and "HOME" as their symbols alone, still named for screen
  readers, the game's mark, its name kept for screen readers, and at the
  right the climb level, where there is one, and the tries. Sizes hold
  to within a pixel.

  Scenario Outline: The board stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I play a board of <board>
    Then I see no picture asking to turn sideways or to make the window wider
    And the board stands in <rows> rows of <columns> cards, each <card> CSS pixels wide
    And the screen <scrolls> up and down

    Examples:
      | width | height | board                        | rows | columns | card | scrolls         |
      | 744   | 1133   | Hatchling's climb level 1    | 3    | 2       | 290  | does not scroll |
      | 744   | 1133   | Hatchling's climb level 4    | 4    | 3       | 214  | does not scroll |
      | 744   | 1133   | Explorer, 9 pairs            | 6    | 3       | 138  | does not scroll |
      | 744   | 1133   | Paleontologist, 12 pairs     | 6    | 4       | 138  | does not scroll |
      | 768   | 1024   | Paleontologist, 12 pairs     | 6    | 4       | 121  | does not scroll |
      | 768   | 1024   | Explorer, 9 pairs            | 6    | 3       | 130  | scrolls         |
      | 820   | 1180   | Hatchling's climb level 2    | 4    | 2       | 225  | does not scroll |
      | 1024  | 1366   | Paleontologist, 12 pairs     | 6    | 4       | 174  | does not scroll |
      | 600   | 800    | Hatchling's climb level 1    | 3    | 2       | 186  | does not scroll |
      | 600   | 800    | Hatchling's climb level 4    | 4    | 3       | 150  | scrolls         |
      | 600   | 800    | Paleontologist, 12 pairs     | 6    | 4       | 120  | scrolls         |

  Scenario Outline: The bar fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When I play Hatchling's climb level 4 with 100 tries
    Then "BACK", "HOME", the game's mark, the climb level and the tries stand in one row, none cut
    And "BACK" and "HOME" are each at least 56 pixels a side and named for screen readers

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | a scrollbar that takes 16    |

  Scenario: A found pair's names fit upright
    Given a window of 768 by 1024 CSS pixels
    When I find every pair of a Paleontologist board, in English and in Russian
    Then each found card's name stands on it as in landscape, none cut

  Scenario: The board glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on an Explorer board with one pair found and one card turned over
    When the window becomes 820 by 1180 CSS pixels
    Then every card glides from its old place and size to its new one, together, over 240 ms easing out, as turn-motion.feature tells
    And no card rises in or flips again
    And the found pair, the turned card and the tries stay as they were, and play goes on
    And under reduced motion the old layout only fades into the new, over 160 ms

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I play a board
    Then the bar sits under the top inset and the last row of cards above the home indicator
    And the screen's background still reaches the window's edges
