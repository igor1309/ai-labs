Feature: DIG: the field guide in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, DIG's
  FIELD GUIDE stands upright: the bar across the top, HOME and BACK as
  their symbols, and the five treasure cards in rows of two that share
  the height under it, the last one centred. The rest is as
  dig-field-guide.feature tells. With it DIG plays whole upright.

  Scenario Outline: The field guide stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open the FIELD GUIDE from DIG's board
    Then I see no picture asking to turn sideways or to make the window wider
    And the five cards stand in rows of two, the last one centred, every card inside the window

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels
    When I open the FIELD GUIDE with every kind found
    Then the bar's title and every card's name fit their room, HOME and BACK named for screen readers

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: BACK returns to the board upright
    Given a window of 820 by 1180 CSS pixels on the FIELD GUIDE, opened from the board
    When I tap BACK
    Then I see the board again, upright
