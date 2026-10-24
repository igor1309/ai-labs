Feature: Care: the result in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, care's
  result stands upright in the result's centred column: the visitor at
  the top, then the score, the hearts in one row, "WELL DONE!" or "NEW
  FRIEND!", the friend and best score chips, and NEW VISITOR, FRIENDS
  and HOME stacked across the width. The rest is as
  dinosaur-care-result.feature tells. Care now plays whole upright in a
  tall window. A tall-narrow window has its own sizes
  (dinosaur-care-narrow-portrait.feature).

  Scenario Outline: The result stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a visit
    Then I see no picture asking to turn sideways or to make the window wider
    And the result stands in one centred column, its three actions stacked across the width

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels
    When I finish a visit
    Then the hearts stand in one row
    And the title, every visitor's name on its chip and every action fit the width

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The result glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on care's result
    When the window becomes 820 by 1180 CSS pixels
    Then the visitor, the rewards and the actions glide to their new places
    And NEW VISITOR still brings a new visitor
