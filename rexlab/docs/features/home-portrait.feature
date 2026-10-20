Feature: The home page in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, an iPad in Split View or Stage Manager, a Mac window taller
  than it is wide), the home page stands upright: the corner and the
  greeting at the top, the large card under them, and the row of tiles
  under the large card, with the same columns of two,
  the same order and the same sideways scroll as in a landscape window
  (home-tiles.feature, home-featured-card.feature). Nothing else on the
  page changes. A tall-narrow window, under 600 wide (an iPhone
  upright), still asks to turn sideways (window-shape.feature). Turning
  the window reflows the page straight to its other layout; the motion
  for that is LAB-375's.

  Budgets count no safe-area inset, as window-fit.feature says.

  Scenario Outline: The home page stands upright
    Given a window of <width> by <height> CSS pixels
    And the large card features COMPARE
    When I open the home page
    Then I see no picture asking to turn sideways or to make the window wider
    And "RexLab", the museum button and the parents' menus stand on one line at the top, the greeting under them
    And the large card stands under the greeting, centred, as large as the room the tiles' row leaves it, its whole picture shown
    And under the large card I see "ALL DINOSAURS" over "FIND THE PAIR", then "SKELETONS" over "DIG"
    And every column of tiles is as wide as the others, every tile half its column's height
    And at least 24 pixels of the first column that does not fit peek in at the right edge
    And the whole page fits the window with no scrolling up or down

    Examples:
      | width | height | window                         |
      | 600   | 800    | iPad in Split View, or a Mac   |
      | 744   | 1060   | iPad mini upright, in Safari   |
      | 744   | 1133   | iPad mini upright, full screen |
      | 820   | 1180   | iPad Air upright               |
      | 834   | 1194   | iPad Pro 11" upright           |
      | 1032  | 1376   | iPad Pro 13" upright           |
      | 900   | 1000   | Mac window, nearly square      |

  Scenario: The tiles scroll sideways under the large card
    Given a window of 744 by 1133 CSS pixels
    And I am on the home page
    When I swipe the tiles to the left until they stop
    Then I see "MORE COMING" at the right edge
    And the large card stays in place
    When I swipe back to the right
    Then I see "ALL DINOSAURS" at the left edge again

  Scenario Outline: Every word fits the narrowest tall window
    Given the app is in <language>
    And a window of 600 by 800 CSS pixels
    And I have a best score of 7 in COMPARE, 8 in CARE, 6 in SORT and 3 in SKELETONS, 120 stars in FIND THE PAIR and 7 dinosaurs dug up in DIG
    And the large card features <featured>
    When I open the home page
    Then the large card keeps its name on one line, in large capitals, and its badge in its picture's corner
    And every tile keeps its title on one line, but "FIND THE PAIR" on two at most
    And every title is at least 24 pixels tall, and "MORE COMING" at least 20
    And every count is at least 20 pixels tall and stays in its tile's picture corner
    And the museum button keeps its word on one line, and nothing in the corner overlaps the greeting or the large card

    Examples:
      | language | featured      |
      | English  | COMPARE       |
      | Russian  | COMPARE       |
      | Russian  | ALL DINOSAURS |
      | Russian  | FIND THE PAIR |
      | Russian  | SKELETONS     |

  Scenario Outline: The parents' menus open inside the window
    Given the app is in Russian
    And a window of 600 by 800 CSS pixels
    When I open the <menu> menu
    Then the whole menu is in the window, each name on one line
    And a tap outside it closes it and opens nothing

    Examples:
      | menu      |
      | language  |
      | theme     |
      | age level |

  Scenario: The version footer stays clear
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I open the home page
    Then the version footer and every tile sit clear of the rounded corners and the home indicator

  Scenario: Turning the window keeps the home page as it was
    Given a window of 1180 by 820 CSS pixels
    And I am on the home page with the theme menu open
    When the window becomes 820 by 1180 CSS pixels
    Then the home page shows its upright layout with the theme menu still open
    And the large card features the same game
    When the window becomes 1180 by 820 CSS pixels
    Then the home page shows its landscape layout with the theme menu still open
