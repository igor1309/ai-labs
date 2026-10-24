Feature: Skeleton assembly: the result in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide, the
  result stands upright: the reward padded 16 with its parts 12 apart,
  the fact at 18 pixels, and "BUILD ANOTHER" and "MUSEUM" each 56 tall
  with 17-pixel words on one line. On a short phone the screen scrolls so
  the board keeps at least 160 pixels of width.

  Scenario Outline: The result stands upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I finish a skeleton
    Then I see no picture asking to turn sideways or to make the window wider
    And every way on fits one line

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 393   | 852    | English  |
      | 430   | 932    | Russian  |
