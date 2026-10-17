Feature: The home page's game tiles
  Beside the COMPARE card the other games stand in a row of columns, two
  tiles to a column but the last, every column as wide as the others. The columns do
  not all fit beside COMPARE on any iPad, so the row scrolls sideways
  under the finger, and the next column peeks in at the edge to show
  there is more.

  Background:
    Given an iPad in landscape

  Scenario: The tiles stand in equal columns of two beside COMPARE
    When I open the home page
    Then beside the "COMPARE" card I see "ALL DINOSAURS" over "CARE"
    And then "SORT" over "FIND THE PAIR"
    And then "MORE COMING", last, at the top of its column, with nothing under it
    And every column of tiles is as wide as the others
    And every tile is as tall as the others, half its column

  Scenario: MORE COMING is a picture, not a game
    When I open the home page
    Then "MORE COMING" shows a faded dinosaur's shape over a lock
    And it neither brightens under a pointer nor shows a pressed state
    And tapping it opens nothing

  Scenario Outline: The tiles scroll sideways
    Given the screen is <width> by <height> CSS pixels
    When I open the home page
    Then the row shows "ALL DINOSAURS" and "CARE" at its left edge
    And at least 24 pixels of the first column that does not fit peek in at the right edge
    When I swipe the tiles to the left until they stop
    Then I see "MORE COMING" at the right edge
    And the "COMPARE" card stays in place
    When I swipe back to the right
    Then I see "ALL DINOSAURS" and "CARE" again

    Examples:
      | width | height |
      | 1024  | 768    |
      | 1133  | 744    |
      | 1180  | 820    |
      | 1366  | 1024   |
      | 1376  | 1032   |

  Scenario: A swipe across a tile only scrolls
    Given I am on the home page
    When I swipe the tiles to the left, starting on the "SORT" card
    Then the tiles scroll
    And no game opens
    And no tile is left pressed

  Scenario: The tiles stand at their start again on coming home
    Given I swiped the tiles to "MORE COMING"
    When I open "FIND THE PAIR" and go back home
    Then the row shows "ALL DINOSAURS" and "CARE" at its left edge

  Scenario Outline: Every tile's words fit it
    Given the app is in <language>
    And the screen is <width> by <height> CSS pixels
    And I have a best score of 8 in CARE and 6 in SORT, and 120 stars in FIND THE PAIR
    When I open the home page
    Then every tile keeps its title on one line, but "FIND THE PAIR" on two at most
    And every title is at least 24 pixels tall, and "MORE COMING" at least 20
    And every count is at least 20 pixels tall and stays in its tile's picture corner

    Examples:
      | language | width | height |
      | English  | 1024  | 768    |
      | English  | 1366  | 1024   |
      | Russian  | 1024  | 768    |
      | Russian  | 1180  | 820    |

  Scenario Outline: MORE COMING reads well in both themes
    Given the app uses the <theme> theme
    When I open the home page
    Then the words "MORE COMING" keep at least 4.5:1 contrast with their tile

    Examples:
      | theme |
      | light |
      | dark  |
