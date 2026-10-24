Feature: Skeleton assembly: the guess in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide, the
  guess stands upright: the names one over another, each a row with its
  80-pixel picture beside its name, the name's type from its letters and
  never under 12 pixels. On a short phone the screen scrolls so the board
  keeps at least 160 pixels of width.

  Scenario Outline: The guess stands upright on a phone
    Given a window of <width> by <height> CSS pixels
    When I build the mystery skeleton
    Then I see no picture asking to turn sideways or to make the window wider
    And the names stand one over another, each on one line

    Examples:
      | width | height |
      | 320   | 568    |
      | 375   | 667    |
      | 393   | 852    |
      | 430   | 932    |
