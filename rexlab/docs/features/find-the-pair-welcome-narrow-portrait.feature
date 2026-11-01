Feature: Find the pair: the welcome in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), find the pair's welcome stands upright as in a tall
  window, on 24-pixel padding at the top, 32 at the bottom and 20 a
  side, its parts 20 apart. "HOME" shows its house alone, still named
  for screen readers. The hero card stands over the start, at most 280
  wide and never under 80: below that the whole screen scrolls. The
  game's mark is 64, the chips 52 tall in 22-pixel type, and "PLAY" 80
  tall in 30-pixel type. Every word in either language fits from 320
  wide, and every tap is at least 44 pixels.

  Scenario Outline: The welcome stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I open find the pair
    Then I see no picture asking to turn sideways or to make the window wider
    And the hero card stands <card> pixels wide over the start
    And the screen <scrolls>

    Examples:
      | width | height | card | scrolls         |
      | 320   | 568    | 80   | scrolls         |
      | 375   | 667    | 107  | does not scroll |
      | 393   | 759    | 113  | does not scroll |
      | 393   | 852    | 113  | does not scroll |
      | 430   | 932    | 125  | does not scroll |

  Scenario Outline: Every word fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I open find the pair
    Then the title, the chips and "PLAY" each stand on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The welcome takes the phone's sizes as the window narrows
    Given find the pair's welcome upright in a tall window
    When the window narrows to 393 by 852
    Then the welcome stays, in the phone's sizes, with no picture asking to turn
