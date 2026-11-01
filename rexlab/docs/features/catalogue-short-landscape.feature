Feature: The catalogue on an iPhone on its side

  In a landscape window under 600 tall, an iPhone on its side, the
  catalogue keeps its bar to one short row and its cards to the height
  that row leaves.

  Scenario Outline: The bar is one short row
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When the catalogue opens
    Then HOME and the four food symbols stand on one row, 8 pixels under the top
    And every one of them is a 48-pixel tap
    And the row keeps 20 pixels past the notch on each side

    Examples:
      | language | width | height |
      | English  | 667   | 375    |
      | English  | 852   | 393    |
      | English  | 932   | 430    |
      | Russian  | 667   | 375    |
      | Russian  | 852   | 393    |
      | Russian  | 932   | 430    |

  Scenario Outline: The cards fit the height
    Given a window of <width> by <height> CSS pixels
    When the catalogue opens
    Then the cards stand <columns> to a row, each whole in the height under the bar
    And every name is on one line, as large as in landscape
    And the list scrolls, its last row clear of the home indicator

    Examples:
      | width | height | columns |
      | 667   | 375    | 2       |
      | 852   | 393    | 3       |
      | 932   | 430    | 3       |

  Scenario: A taller window goes back to the iPad's layout
    Given the catalogue is open on an iPhone on its side
    When the window grows past 600 tall
    Then the cards stand four to a row again
