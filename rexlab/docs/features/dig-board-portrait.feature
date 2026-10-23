Feature: DIG: the board at Hatchling in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, DIG's
  board at Hatchling stands upright: the bar across the top, HOME as its
  symbol, and the sand as wide as the window leaves it, in its picture's
  shape. A stroke on the sand brushes it and never scrolls the page. The
  rest is as dig-brush.feature tells. A board that asks WHO IS IT?, the
  reveal and the field guide still ask to turn, and a tall-narrow window
  keeps the picture asking to turn or widen (window-shape.feature).

  Scenario Outline: The board stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    And the level is Hatchling
    When I open DIG
    Then I see no picture asking to turn sideways or to make the window wider
    And the sand fills the width under the bar, in its picture's shape

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario: The bar keeps one row at the narrowest width
    Given a window of 600 by 1000 CSS pixels at Hatchling
    When I open DIG
    Then HOME shows as its symbol, named for screen readers, beside the title, the brushes and the field guide

  Scenario: A stroke brushes the sand upright
    Given a window of 820 by 1180 CSS pixels at Hatchling, on the board
    When I drag a finger across the sand
    Then the sand clears along the stroke and the page does not move

  Scenario: A board that asks still asks to turn
    Given a window of 820 by 1180 CSS pixels
    And the level is Explorer
    When I open DIG
    Then I see the picture asking to turn sideways
