Feature: A compare question in a short landscape window

  In a wide-short window, landscape under 600 tall and at least 568 wide, a compare
  question keeps its two dinosaurs side by side. Its pictures stay at least 110
  CSS pixels high; when minimum content cannot fit, the whole page scrolls
  vertically and the sky scrolls with it.

  Scenario Outline: The cards share the row under a short bar
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When a compare question opens
    Then HOME, the steps and the progress stand on one short bar, 8 pixels under the top
    And the prompt stands on one line under the bar, with the row for NEXT beside it
    And the two cards stand side by side, VS, or ИЛИ in Russian, between them, in the height the bar and the prompt leave
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

  Scenario: Every word fits across short landscape widths
    Given a compare question in a wide-short window, from 568 to 932 pixels wide
    Then every prompt fits on one line beside the widest NEXT
    And every name fits on one line in its card
    And every value, once shown, fits in its picture's area

  Scenario: An answer moves nothing
    Given a compare question in a wide-short window
    When the child taps a card
    Then NEXT appears beside the prompt and each value at the bottom right of its picture, and no card grows

  Scenario Outline: Resizing selects the new window class
    Given a compare question in a wide-short window
    When the window becomes <width> by <height> CSS pixels
    Then its class is <class> and the cards are <cards>

    Examples:
      | width | height | class       | cards        |
      | 852   | 600    | wide        | side by side |
      | 568   | 600    | tall-narrow | stacked      |
      | 600   | 600    | tall        | stacked      |
