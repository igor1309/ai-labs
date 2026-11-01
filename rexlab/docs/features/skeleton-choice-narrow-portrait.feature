Feature: Skeleton assembly: the choice in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), the choice stands upright: 24 pixels above, 32 below
  and 20 at the sides, its parts 16 apart, the bar's buttons 48-pixel
  symbols with their words kept for screen readers, and the skeletons two
  to a row, 12 apart.

  Scenario Outline: The choice stands upright on a phone
    Given a window of <width> by <height> CSS pixels
    When I open skeleton assembly
    Then I see no picture asking to turn sideways or to make the window wider
    And the skeletons stand two to a row, 12 pixels apart

    Examples:
      | width | height |
      | 320   | 568    |
      | 375   | 667    |
      | 393   | 852    |
      | 430   | 932    |
