Feature: The museum from the home page
  The skeleton museum (skeleton-assembly-museum.feature) is the child's
  collection, so the home page opens it directly, from a button in the
  top-right corner just left of the parents' language and theme menus.
  Unlike those menus it is for the child: its word is in capitals beside
  the museum symbol, and it is sized for a child's tap. It carries no
  count: the collection score is the museum's own, shown inside it.

  Background:
    Given an iPad in landscape

  Scenario Outline: The home page offers the museum
    Given the app is in <language>
    When I open the home page
    Then I see "<museum>" in the top-right corner
    And beside it the symbol of the skeleton game's MUSEUM button
    And it stands outside the shaded group of the parents' menus, to its left
    And it is at least 60 by 60 CSS pixels
    And at least 12 CSS pixels lie between it and the group

    Examples:
      | language | museum |
      | English  | MUSEUM |
      | Russian  | МУЗЕЙ  |

  Scenario: The button opens the museum, and HOME comes back
    Given I have finished Triceratops but neither of the other skeletons
    When I tap "MUSEUM" on the home page
    Then I see the museum hall with the Triceratops skeleton on its stand
    And my collection score is "1/5"
    When I tap "HOME"
    Then I see the home page
    When I tap "SKELETONS"
    Then I see the skeleton game's choice of dinosaurs
    When I go back home, tap "MUSEUM" and then "BUILD ANOTHER"
    Then I see the skeleton game's choice of dinosaurs

  Scenario: Opening the museum is not a start
    Given the Stegosaurus stand is unearned
    When I open the museum from the home page and go back home
    Then no start count changes
    When I open the museum from the home page and build the Stegosaurus from its empty stand
    Then SKELETONS counts one more start

  Scenario: A quick double tap opens the museum once
    When I tap "MUSEUM" on the home page twice quickly
    Then I see the museum hall
    And the second tap pressed nothing on the museum screen
    And one tap on "HOME" brings me back to the home page

  Scenario Outline: A tap that closes a menu opens nothing
    Given the <menu> menu is open on the home page
    When I tap "MUSEUM"
    Then the menu closes
    And I am still on the home page

    Examples:
      | menu      |
      | language  |
      | theme     |
      | age level |

  Scenario Outline: The corner fits on one line
    Given the app is in <language>
    And the screen is <width> by <height> CSS pixels
    When I open the home page
    Then "RexLab", the museum button and the parents' menus stand on one line
    And the museum button keeps its word on one line
    And nothing in the corner overlaps the greeting or the large card

    Examples:
      | language | width | height |
      | English  | 1024  | 768    |
      | Russian  | 1024  | 768    |
      | Russian  | 1133  | 744    |
      | English  | 1366  | 1024   |
      | Russian  | 1366  | 1024   |

  Scenario Outline: The button reads in either theme
    Given the app uses the <theme> theme
    When I open the home page
    Then the museum button's word and symbol keep at least 4.5:1 contrast with the button
    And the button keeps at least 3:1 contrast with the page
    And under a pointer it brightens, and when pressed it shows a pressed state, as the game tiles do

    Examples:
      | theme |
      | light |
      | dark  |

  Scenario: Opening the museum moves
    Given the device does not ask for reduced motion
    When I tap "MUSEUM" on the home page
    Then the change to the museum animates with the shared motion tokens

  Scenario: Reduced motion fades to the museum
    Given the device asks for reduced motion
    When I tap "MUSEUM" on the home page
    Then the change to the museum is a short fade
