Feature: Find the pair: the board in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), find the pair's board stands upright as in a tall
  window, its grid on its side, on 24-pixel padding at the top, 32 at
  the bottom and 20 a side, the bar 20 above the board. The cards stand
  8 apart in their landscape shape, as large as lets the board fit the
  width and the height under the bar, never under 56 wide on any board:
  below that the whole screen scrolls. The bar keeps one row: "BACK" and
  "HOME" as their symbols, 48 wide, the game's name kept for screen
  readers, and the climb's chip in 20-pixel type at the right. A found
  card shows its dinosaur without its name, which stays for screen
  readers; a card whose picture fails still shows its name. Every tap is
  at least 44 pixels.

  Scenario Outline: The board stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I start a board of <board>
    Then I see no picture asking to turn sideways or to make the window wider
    And the board stands in <rows> rows of <columns>, each card <card> pixels wide
    And the screen <scrolls>

    Examples:
      | width | height | board              | rows | columns | card | scrolls         |
      | 320   | 568    | Hatchling's climb 1 | 3    | 2       | 131  | does not scroll |
      | 320   | 568    | Hatchling's climb 2 | 4    | 2       | 97   | does not scroll |
      | 393   | 852    | Hatchling's climb 4 | 4    | 3       | 112  | does not scroll |
      | 393   | 759    | Explorer           | 6    | 3       | 92   | does not scroll |
      | 393   | 852    | Paleontologist     | 6    | 4       | 82   | does not scroll |
      | 320   | 568    | Paleontologist     | 6    | 4       | 62   | does not scroll |
      | 320   | 400    | Paleontologist     | 6    | 4       | 56   | scrolls         |

  Scenario Outline: The bar fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I start a board of Hatchling's climb
    Then "BACK", "HOME" and the climb's chip stand in one row

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The board takes the phone's sizes as the window narrows
    Given a board upright in a tall window
    When the window narrows to 393 by 852
    Then the board stays, in the phone's sizes, with no picture asking to turn
    And when I find every pair, the result stands upright with no picture asking to turn
