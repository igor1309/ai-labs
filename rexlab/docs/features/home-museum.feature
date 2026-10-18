Feature: The museum from the home page
  The skeleton museum (skeleton-assembly-museum.feature) is the child's
  collection, so the home page opens it directly, from a button in the
  top-right corner just before the parents' language and theme menus.
  Unlike those menus it is for the child: its word is in capitals beside
  a symbol, and it is sized for a child's tap.

  Background:
    Given an iPad in landscape

  Scenario Outline: The home page offers the museum
    Given the app is in <language>
    When I open the home page
    Then I see "<museum>" with a museum symbol in the top-right corner
    And it is first in the row of the language and theme menus, before them
    And it is at least 60 by 60 CSS pixels

    Examples:
      | language | museum |
      | English  | MUSEUM |
      | Russian  | МУЗЕЙ  |

  Scenario: The button opens the museum, and HOME comes back
    Given I have finished Triceratops but neither of the other skeletons
    When I tap "MUSEUM" on the home page
    Then I see the museum hall with the Triceratops skeleton on its stand
    And my collection score is "1/3"
    When I tap "HOME"
    Then I see the home page
    When I tap "MUSEUM" and then "BUILD ANOTHER"
    Then I see the skeleton game's choice of dinosaurs

  Scenario: A quick double tap opens the museum once
    When I tap "MUSEUM" on the home page twice quickly
    Then the museum opens once
    And one tap on "HOME" brings me back to the home page

  Scenario: A tap that closes a menu opens nothing
    Given the language menu is open on the home page
    When I tap "MUSEUM"
    Then the menu closes
    And I am still on the home page

  Scenario Outline: The corner fits on one line
    Given the app is in <language>
    And the screen is <width> by <height> CSS pixels
    When I open the home page
    Then "RexLab", the museum button and the two menus stand on one line
    And the museum button keeps its word on one line
    And nothing in the corner overlaps the greeting or the large card

    Examples:
      | language | width | height |
      | English  | 1024  | 768    |
      | Russian  | 1024  | 768    |
      | Russian  | 1366  | 1024   |

  Scenario Outline: The button reads in either theme
    Given the app uses the <theme> theme
    When I open the home page
    Then the museum button stands out from the page in the <theme> theme
    And under a pointer and when pressed it changes as the game tiles do

    Examples:
      | theme |
      | light |
      | dark  |

  Scenario: Opening the museum moves
    When I tap "MUSEUM" on the home page
    Then the change to the museum animates with the app's shared motion timings
    But when the device asks for reduced motion, the change is a short fade
