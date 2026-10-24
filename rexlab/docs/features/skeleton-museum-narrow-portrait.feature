Feature: Skeleton assembly: the museum in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide, the
  museum stands upright with the choice's padding and bar, its hall
  padded 12 and its stands two to a row, 12 apart.

  Scenario Outline: The museum stands upright on a phone
    Given a window of <width> by <height> CSS pixels
    When I open the museum
    Then I see no picture asking to turn sideways or to make the window wider
    And the stands go two to a row, 12 pixels apart

    Examples:
      | width | height |
      | 320   | 568    |
      | 393   | 852    |
      | 430   | 932    |
