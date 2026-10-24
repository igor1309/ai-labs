Feature: Care: the welcome in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, care's
  welcome stands upright: the bar across the top, HOME as its symbol,
  and NEW VISITOR over FRIENDS across the width, NEW VISITOR the
  taller. The rest is as dinosaur-care-start.feature tells. A
  tall-narrow window keeps the picture asking to turn or widen
  (window-shape.feature).

  Scenario Outline: The welcome stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open care
    Then I see no picture asking to turn sideways or to make the window wider
    And NEW VISITOR stands over FRIENDS, each as wide as the window leaves them

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels
    When I open care
    Then the bar's title, NEW VISITOR and FRIENDS fit on one line, HOME named for screen readers

    Examples:
      | language |
      | English  |
      | Russian  |
