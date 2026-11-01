Feature: Compare dinosaurs quiz: the result in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), the compare quiz's result stands upright as in a tall
  window, in one column on 20-pixel padding, its rewards, the level
  switch and the actions 12 apart. The score is 12% of the window's
  height, at most 180; the ten stars share the width; the celebration is
  in 18-pixel type and "WELL DONE!" in 34. The level switch shows each
  level's picture alone, its name kept for screen readers, the chosen
  one marked as in a tall window. "PLAY AGAIN" stands over "HOME", each
  64 tall and across the column. The dinosaur takes the height the
  column leaves, never under 120: below that the whole screen scrolls.
  The offer of a level stands 16 from the window's sides, its question
  in 22-pixel type and "YES" and "NOT NOW" 64 tall. Every word in either
  language fits from 320 wide, and every tap is at least 44 pixels.

  Scenario Outline: The result stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I finish a round of the compare quiz with a new best
    Then I see no picture asking to turn sideways or to make the window wider
    And the dinosaur stands <dinosaur> pixels tall over the rewards, the level switch and the actions
    And the screen <scrolls>

    Examples:
      | width | height | dinosaur | scrolls         |
      | 320   | 568    | 120      | scrolls         |
      | 375   | 667    | 120      | scrolls         |
      | 393   | 759    | 143      | does not scroll |
      | 393   | 852    | 225      | does not scroll |
      | 430   | 932    | 292      | does not scroll |

  Scenario Outline: Every word fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I see the result of a round with a first best, and the offer of a level
    Then every word stands on its line, and "PLAY AGAIN" and "HOME" each on one line across the column

    Examples:
      | language |
      | English  |
      | Russian  |
