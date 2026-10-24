Feature: Care: the friends in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, care's
  FRIENDS stands upright: BACK and HOME as their symbols, the title and
  the friend count on the bar, NEW VISITOR across the width under it,
  and the friends' cards two to a row. With no friends yet, the nest
  and NEW VISITOR stand in the middle. The rest is as
  dinosaur-care-friends.feature tells. A tall-narrow window has its own sizes
  (dinosaur-care-narrow-portrait.feature).

  Scenario Outline: The friends stand upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    And three dinosaurs are my friends
    When I open "FRIENDS"
    Then I see no picture asking to turn sideways or to make the window wider
    And the friends' cards stand two to a row, NEW VISITOR across the width over them

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels
    When I open "FRIENDS", with friends and with none
    Then the bar keeps one row, BACK and HOME named for screen readers
    And NEW VISITOR, the nest's words and every friend's name fit

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario Outline: Turning keeps the friends and the list's place
    Given all the dinosaurs are my friends
    And I am on FRIENDS in landscape, scrolled to <place>
    When the device turns upright
    Then I see the same friends, each card gliding to its new place
    And the list stands at <place>, two cards to a row

    Examples:
      | place                      |
      | its end                    |
      | the row of the 21st friend |
