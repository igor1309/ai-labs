Feature: Build a skeleton: the result in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, a
  finished skeleton's result stands upright: the bar across the top, the
  skeleton under it, its body fading in over its bones, as wide as the
  screen or the room above the reward allows, and under it the reward:
  the star, the celebration, the badge, the name, the fact, the best and
  BUILD ANOTHER over MUSEUM. The rest is as skeleton-assembly.feature
  tells. A tall-narrow window has its own sizes
  (skeleton-result-narrow-portrait.feature).

  Scenario Outline: The result stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a skeleton
    Then I see no picture asking to turn sideways or to make the window wider
    And the skeleton stands over its reward, and the reward keeps its room

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a skeleton
    Then the name, BUILD ANOTHER and MUSEUM each fit on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The result glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on a result
    When the window becomes 820 by 1180 CSS pixels
    Then the skeleton and its reward glide to their new places
    And BUILD ANOTHER still opens the choice
