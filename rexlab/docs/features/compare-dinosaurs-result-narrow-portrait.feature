Feature: Compare dinosaurs quiz: the result in a tall-narrow window
  In a tall-narrow window, portrait under 600 CSS pixels wide or landscape
  under 568 wide, the result places the dinosaur in the sky above the sand's
  rewards and level switch. Dig-site tokens size type, colours and gaps.
  The switch shows each level's picture alone and keeps its name accessible.
  PLAY AGAIN stands over HOME, both across the column and 64 pixels tall.
  The dinosaur takes the remaining height, never below 120 CSS pixels.
  The whole page, sky included, scrolls vertically only when its minimum
  contents cannot fit. Every word fits from 320 wide and every tap is at
  least 44 pixels. Level-offer dialogs keep their existing behaviour.

  Scenario Outline: The result stands upright in a narrow window
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I finish a round of the compare quiz with a new best
    Then no orientation gate covers the result
    And the dinosaur stands at least 120 CSS pixels high above the rewards, level switch and actions
    And PLAY AGAIN stands above HOME
    And the whole screen scrolls vertically only when its minimum content cannot fit

    Examples:
      | width | height |
      | 320   | 568    |
      | 375   | 667    |
      | 393   | 759    |
      | 393   | 852    |
      | 430   | 932    |

  Scenario Outline: Every word fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I see the result of a round with a first best, and the offer of a level
    Then every word stands on its line, and "PLAY AGAIN" and "HOME" each on one line across the column

    Examples:
      | language |
      | English  |
      | Russian  |
