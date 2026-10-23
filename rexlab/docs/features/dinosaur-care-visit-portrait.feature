Feature: Care: a visit in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, a care
  visit stands upright: the bar with HOME as its symbol, the needs and
  the hearts across the top, the visitor on a stage as wide as the window
  leaves it, its name above the need's bubble, and the five items to give
  in one row under it. The rest is as dinosaur-care-visit.feature tells.
  FRIENDS and the result still ask to turn, and a tall-narrow window keeps
  the picture asking to turn or widen (window-shape.feature).

  Scenario Outline: A visit stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When a new visitor comes
    Then I see no picture asking to turn sideways or to make the window wider
    And the visitor's stage is as wide as the window leaves it, the five items in one row under it

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels
    When a new visitor comes
    Then the bar keeps one row, HOME named for screen readers
    And every visitor's name and every item's word fit on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: Turning mid-visit keeps the visit
    Given a visit in landscape, one need met
    When the device turns upright
    Then I see the same visitor, the same hearts and the same needs met and asked
    And the stage and the items glide to their new places
