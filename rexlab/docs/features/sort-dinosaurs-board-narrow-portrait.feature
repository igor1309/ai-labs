Feature: Sort dinosaurs: the board in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), the sorting board stands upright as in a tall window,
  on 24-pixel padding at the top, 32 at the bottom and 20 a side, its
  parts 16 apart. "HOME" shows its house alone, still named for screen
  readers, and the prompt is in 22-pixel type. The tray's cards stand 8
  apart, as wide as the width allows and as leaves the baskets 240 of
  the height, never under 72 wide: below that the whole screen scrolls.
  The baskets stand side by side, 8 apart and 12 inside, each showing
  its mark alone, 44 tall, its name kept for screen readers: no name fits
  a basket a third of a phone wide. Size keeps its big and its small
  footprint. Every tap is at least 44 pixels.

  Scenario Outline: The board stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I start a <level> board
    Then I see no picture asking to turn sideways or to make the window wider
    And the tray stands in <rows> rows of <columns>, each card <card> pixels wide
    And the screen <scrolls>

    Examples:
      | width | height | level          | rows | columns | card | scrolls         |
      | 320   | 568    | Hatchling      | 2    | 3       | 72   | scrolls         |
      | 393   | 852    | Hatchling      | 2    | 3       | 112  | does not scroll |
      | 393   | 852    | Explorer       | 2    | 4       | 82   | does not scroll |
      | 393   | 852    | Paleontologist | 3    | 4       | 82   | does not scroll |
      | 430   | 932    | Paleontologist | 3    | 4       | 92   | does not scroll |

  Scenario Outline: Every mark and the prompt fit the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I see a board of any baskets a level deals
    Then every basket's mark fits inside its basket
    And the prompt stands on one line beside its symbol

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The board takes the phone's sizes as the window narrows
    Given a sorting board upright in a tall window
    When the window narrows to 393 by 852
    Then the board stays, in the phone's sizes, with no picture asking to turn
