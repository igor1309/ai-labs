Feature: Find the pair: the result in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), find the pair's result stands upright as in a tall
  window, on 20-pixel padding, the dinosaurs 16 above the column, whose
  parts stand 12 apart. The dinosaurs stand 8 apart, each card never
  under 64 tall: below that the whole screen scrolls. NEW shows its
  sparkle alone, the word kept for screen readers. The tries are 12% of
  the window's height, at most 180, beside a 64-pixel hand; the stars
  are 40 and "WELL DONE!" 34. "PLAY AGAIN" stands across the column
  over "BACK" and "HOME", which share the row under it, each 64 tall and
  10 apart, in one type as large as lets them fit, at most 22. Every word
  in either language fits from 320 wide, and every tap is at least 44
  pixels.

  Scenario Outline: The result stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I finish a board of <board>
    Then I see no picture asking to turn sideways or to make the window wider
    And each dinosaur's card stands <card> pixels tall over the column
    And the screen <scrolls>

    Examples:
      | width | height | board              | card | scrolls         |
      | 320   | 568    | Hatchling's climb 1 | 64   | scrolls         |
      | 375   | 667    | Hatchling's climb 2 | 64   | scrolls         |
      | 393   | 852    | Hatchling's climb 2 | 149  | does not scroll |
      | 393   | 852    | Paleontologist     | 71   | does not scroll |
      | 430   | 932    | Explorer           | 120  | does not scroll |

  Scenario Outline: Every word fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I see the result of a board with a first best and a new level
    Then every name, badge and word stands on its line, "PLAY AGAIN" across the column and "BACK" and "HOME" side by side

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The result takes the phone's sizes as the window narrows
    Given find the pair's result upright in a tall window
    When the window narrows to 393 by 852
    Then the result stays, in the phone's sizes, with no picture asking to turn
