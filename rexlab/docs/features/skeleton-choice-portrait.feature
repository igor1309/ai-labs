Feature: Build a skeleton: the choice in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, the
  skeleton choice stands upright: the bar across the top, the level
  switch under it, and the skeletons in rows of two that fill the
  width, the mystery skeleton last once it is open. The rest is as
  skeleton-choice.feature tells. A tall-narrow window has its own sizes
  (skeleton-choice-narrow-portrait.feature).

  Scenario Outline: The choice stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open Build a skeleton
    Then I see no picture asking to turn sideways or to make the window wider
    And the skeletons stand in rows of two that fill the width, every card inside the window

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and scrollbars that take no room
    When I open Build a skeleton with the mystery skeleton open
    Then the bar's title, every skeleton's name and the level names fit on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The choice glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on the skeleton choice
    When the window becomes 820 by 1180 CSS pixels
    Then the skeleton cards glide to their new places
    And choosing a skeleton still starts its puzzle
