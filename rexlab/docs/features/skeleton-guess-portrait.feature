Feature: Build a skeleton: the mystery's guess in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, the
  mystery's guess stands upright: the bar across the top, the finished
  skeleton under it as wide as the screen lets it be, and under the
  skeleton the three dinosaurs' cards side by side, with the clue below
  them. The rest is as skeleton-assembly-mystery.feature tells. A
  tall-narrow window keeps the picture asking to turn or widen
  (window-shape.feature).

  Scenario Outline: The guess stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a mystery skeleton
    Then I see no picture asking to turn sideways or to make the window wider
    And the skeleton stands over the three cards, side by side, and the clue's place below them

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every name fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a mystery skeleton
    Then every card's name fits on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The guess glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on the mystery's guess
    When the window becomes 820 by 1180 CSS pixels
    Then the skeleton and the cards glide to their new places
    And the right card still names the skeleton
