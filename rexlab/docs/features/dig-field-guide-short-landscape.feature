Feature: DIG's FIELD GUIDE on a phone on its side
  On an iPhone held sideways the FIELD GUIDE shows all five kinds of
  treasure at once under a short bar, every name whole, nothing cut off.

  Scenario Outline: The FIELD GUIDE fits the window
    Given a <width> by <height> window on its side in <language>
    When the child opens the FIELD GUIDE from DIG's board, every kind found
    Then HOME and BACK are squares of their symbols in a short bar, beside the title and the kinds found
    And the five cards stand <arranged>, each its picture, its name and its count, within the height

    Examples:
      | width | height | language | arranged         |
      | 568   | 320    | English  | in one row       |
      | 568   | 320    | Russian  | three over two   |
      | 932   | 430    | English  | in one row       |
      | 932   | 430    | Russian  | three over two   |

  Scenario: Back to the board
    Given the FIELD GUIDE on a phone on its side
    When the child taps BACK
    Then the board shows, still on its side
