Feature: The home page's game tiles
  Beside the COMPARE card the other games stand in a row of columns, two
  tiles to a column, every column as wide as the others. When the columns
  no longer fit beside COMPARE, the row scrolls sideways under the finger,
  and the next column peeks in at the edge to show there is more.

  Background:
    Given an iPad in landscape

  Scenario: The tiles stand in equal columns of two beside COMPARE
    When I open the home page
    Then beside the "COMPARE" card I see "ALL DINOSAURS" over "CARE"
    And then "SORT" over "FIND THE PAIR"
    And then "MORE COMING", last
    And every column of tiles is as wide as the others
    And the two tiles of a column share its height

  Scenario: MORE COMING is a picture, not a game
    When I open the home page
    Then "MORE COMING" shows a faded dinosaur's shape over a lock
    And tapping it opens nothing

  Scenario Outline: The tiles scroll sideways when they do not fit
    Given the screen is <width> by <height> CSS pixels
    When I open the home page
    Then the next column of tiles peeks in at the right edge
    When I swipe the tiles to the left until they stop
    Then I see "MORE COMING" at the right edge
    And the "COMPARE" card stays in place
    When I swipe back to the right
    Then I see "ALL DINOSAURS" and "CARE" again

    Examples:
      | width | height |
      | 1024  | 768    |
      | 1180  | 820    |
      | 1366  | 1024   |

  Scenario Outline: Every tile's words fit it
    Given the app is in <language>
    And the screen is <width> by <height> CSS pixels
    When I open the home page
    Then every tile keeps its title on one line, but "FIND THE PAIR" on two at most
    And every count stays in its tile's picture corner

    Examples:
      | language | width | height |
      | English  | 1024  | 768    |
      | English  | 1366  | 1024   |
      | Russian  | 1024  | 768    |
      | Russian  | 1180  | 820    |

  Scenario: MORE COMING reads well in both themes
    Given the app is in the dark theme
    When I open the home page
    Then the words "MORE COMING" keep at least 4.5:1 contrast with their tile
