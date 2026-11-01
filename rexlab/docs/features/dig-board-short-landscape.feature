Feature: DIG's board on a phone on its side
  On an iPhone held sideways at Hatchling the sand fills the room under
  a short bar, so the child brushes it without the page moving.

  Scenario Outline: The board fits the window
    Given a <width> by <height> window on its side in <language>
    When the child opens DIG at Hatchling
    Then HOME, the brushes and the FIELD GUIDE stand 48 tall in one bar with the title
    And the sand is as tall as the room under the bar, centred
    And a brush stroke never scrolls the page

    Examples:
      | width | height | language |
      | 568   | 320    | Russian  |
      | 667   | 375    | English  |
      | 852   | 393    | English  |
      | 932   | 430    | Russian  |

  Scenario: Turning mid-round
    Given the child has brushed part of the sand with the wide brush
    When the phone turns upright and back
    Then the brushed sand and the wide brush stay
