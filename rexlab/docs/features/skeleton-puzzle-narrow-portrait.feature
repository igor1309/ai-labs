Feature: Skeleton assembly: the puzzle in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide, the
  puzzle stands upright: the board as wide as the screen over the tray,
  16 apart, the tray padded 12 with its bones 8 apart, each spot at least
  48 a side.

  Scenario Outline: The puzzle stands upright on a phone
    Given a window of <width> by <height> CSS pixels
    When I start a puzzle
    Then I see no picture asking to turn sideways or to make the window wider
    And the board spans the screen, leaving the tray at least a third of the puzzle

    Examples:
      | width | height |
      | 320   | 568    |
      | 375   | 667    |
      | 393   | 852    |
      | 430   | 932    |

  Scenario: The puzzle takes the phone's sizes as the window narrows
    Given a puzzle upright in a tall window
    When the window narrows to 393 by 852
    Then the puzzle stays, in the phone's sizes, with no picture asking to turn
