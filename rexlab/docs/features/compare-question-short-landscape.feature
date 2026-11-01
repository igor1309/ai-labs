Feature: A compare question on an iPhone on its side

  In a landscape window under 600 tall, an iPhone on its side, a compare
  question keeps its two dinosaurs side by side, whole within the height.

  Scenario Outline: The cards share the row under a short bar
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When a compare question opens
    Then HOME, the steps and the progress stand on one short bar, 8 pixels under the top
    And the prompt stands on one line under the bar, with the row for NEXT beside it
    And the two cards stand side by side, "VS" between them, in the height the bar and the prompt leave
    And the question keeps 20 pixels past the notch on each side and clears the home indicator
    And every tap is at least 44 pixels

    Examples:
      | language | width | height |
      | English  | 667   | 375    |
      | English  | 852   | 393    |
      | English  | 932   | 430    |
      | Russian  | 667   | 375    |
      | Russian  | 852   | 393    |
      | Russian  | 932   | 430    |

  Scenario: Every word fits at every phone's width
    Given a compare question on an iPhone on its side, from 568 to 932 pixels wide
    Then every prompt fits on one line beside the widest NEXT
    And every name fits on one line in its card
    And every value, once shown, fits in its picture's area

  Scenario: An answer moves nothing
    Given a compare question on an iPhone on its side
    When the child taps a card
    Then NEXT appears beside the prompt and each value at the bottom right of its picture, and no card grows

  Scenario: A taller window goes back to the iPad's layout
    Given a compare question on an iPhone on its side
    When the window grows past 600 tall
    Then the question takes the iPad's layout
