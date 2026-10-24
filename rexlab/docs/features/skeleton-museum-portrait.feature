Feature: Build a skeleton: the museum in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, the
  museum stands upright: the bar across the top, with HOME and BUILD
  ANOTHER as their symbols, and under it the hall, its stands in rows of
  two. The rest is as skeleton-assembly-museum.feature tells. A tall-narrow window has its own sizes
  (skeleton-museum-narrow-portrait.feature).

  Scenario Outline: The museum stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open the museum
    Then I see no picture asking to turn sideways or to make the window wider
    And its stands stand in rows of two that fill the hall, every exhibit tall enough to show its skeleton

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and scrollbars that take no room
    When I open the museum
    Then the bar keeps one row, and every stand's name and button fit on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The museum glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on the museum
    When the window becomes 820 by 1180 CSS pixels
    Then the stands glide to their new places
    And a stand's button still opens its puzzle
