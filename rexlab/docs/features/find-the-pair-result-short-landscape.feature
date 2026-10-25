Feature: Find the pair's result on a phone on its side
  On an iPhone held sideways the result keeps the dinosaurs found beside
  the tries, the rewards and the actions, all within the height.

  Scenario Outline: The result fits the window
    Given a <width> by <height> window on its side
    When the <board> board is played to its result
    Then the dinosaurs stand beside a 300-pixel column
    And their rows share the height, each card no taller than its shape
    And the column fits the height, both badges shown

    Examples:
      | width | height | board          |
      | 568   | 320    | climb 2        |
      | 667   | 375    | climb 4        |
      | 852   | 393    | explorer       |
      | 932   | 430    | paleontologist |

  Scenario: The actions keep one line each in every language
    Given the result on a phone on its side in English or Russian
    Then PLAY AGAIN stands across the column over BACK and HOME
    And WELL DONE! stands beside the tries over the stars

  Scenario: NEW shows its sparkle alone
    Given the result on a phone on its side
    Then NEW is its sparkle, the word kept for screen readers

  Scenario: Growing past 600 tall brings back the iPad's result
    Given the result on a phone on its side
    When the window grows past 600 tall
    Then the result takes the iPad's layout again
