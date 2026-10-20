Feature: The home page in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, in Split View or Stage Manager, or a tall Mac window), the
  home page stands upright: the corner and the greeting at the top, the
  large card under them, and under it the row of tiles in the same
  columns of two, order and sideways scroll as in landscape
  (home-tiles.feature). Nothing else changes. A tall-narrow window keeps
  the picture asking to turn or widen (window-shape.feature). Turning
  reflows straight to the other layout; its motion is LAB-375's.

  The padding, the greeting's 48-pixel line and the gaps keep their
  landscape sizes, 292 CSS pixels in all. The tiles' row takes 36% of
  the height, 360 to 520, and runs to the window's right edge. Columns
  are 310 wide, narrowed just enough where the next column would show
  under 24 pixels or hide under 24; if that column is the last, enough
  to show it whole. The large card spans the width inside the padding
  and takes the height left, at least 280 with its name strip, its whole
  picture centred in its colour. Safe areas come off its height. Where
  that leaves under 280 the whole page scrolls, wordmark, corner and the
  version footer at its end too. Sizes hold to within a pixel.

  Scenario Outline: The home page stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas
    And the large card features COMPARE
    When I open the home page
    Then I see no picture asking to turn sideways or to make the window wider
    And "RexLab", the museum button and the parents' menus stand on one line at the top, the greeting under them
    And the large card spans the width under the greeting, <card> CSS pixels tall with its name strip, its whole picture shown
    And under the large card the row of tiles is <row> CSS pixels tall, showing "ALL DINOSAURS" over "FIND THE PAIR" first
    And every column of tiles is <column> CSS pixels wide, every tile half of the row less the 28-pixel gap between them
    And the column after the last whole one shows <peek> CSS pixels at the right edge
    And the page <scrolls> up and down, and the version footer overlaps no tile

    Examples:
      | width | height | card | row | column | peek | scrolls         | window                         |
      | 600   | 800    | 280  | 360 | 310    | 210  | scrolls         | iPad in Split View, or a Mac   |
      | 768   | 950    | 298  | 360 | 310    | 44   | does not scroll | iPad 9.7" upright, in Safari   |
      | 768   | 1024   | 363  | 369 | 310    | 44   | does not scroll | iPad 9.7" upright, full screen |
      | 744   | 1060   | 386  | 382 | 308    | 24   | does not scroll | iPad mini upright, in Safari   |
      | 744   | 1133   | 433  | 408 | 308    | 24   | does not scroll | iPad mini upright, full screen |
      | 834   | 1194   | 472  | 430 | 310    | 110  | does not scroll | iPad Pro 11" upright           |
      | 1032  | 1376   | 589  | 495 | 293    | 25   | does not scroll | iPad Pro 13" upright           |
      | 900   | 1000   | 348  | 360 | 310    | 176  | does not scroll | Mac window, nearly square      |
      | 712   | 1000   | 348  | 360 | 292    | 24   | does not scroll | Stage Manager window           |
      | 600   | 1400   | 604  | 504 | 310    | 210  | does not scroll | tall Mac window                |
      | 1032  | 1500   | 688  | 520 | 293    | 25   | does not scroll | tall Mac window                |
      | 1400  | 1500   | 688  | 520 | 310    | 0    | does not scroll | Mac window, all tiles whole    |

  Scenario Outline: Every word fits the tightest tall windows
    Given the app is in <language>
    And a window of <width> by 800 CSS pixels
    And I have a best score of 7 in COMPARE, 8 in CARE, 6 in SORT and 3 in SKELETONS, 120 stars in FIND THE PAIR and 7 dinosaurs dug up in DIG
    And the large card features <featured>
    When I open the home page
    Then the large card's name is as large as on a 1024 by 768 landscape iPad, on no more lines, its badge in its picture's corner
    And every tile keeps its title on one line, but "FIND THE PAIR" on two at most
    And every title is at least 24 pixels tall, and "MORE COMING" at least 20
    And every count is at least 20 pixels tall and stays in its tile's picture corner
    And the museum button keeps its word on one line, and nothing in the corner overlaps "RexLab", the greeting or the large card

    Examples:
      | language | width | featured      |
      | English  | 600   | COMPARE       |
      | Russian  | 600   | ALL DINOSAURS |
      | Russian  | 600   | FIND THE PAIR |
      | Russian  | 677   | COMPARE       |
      | Russian  | 700   | COMPARE       |
      | Russian  | 700   | SKELETONS     |

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

  Scenario: Turning the window keeps the open menu and the large card
    Given a window of 1180 by 820 CSS pixels
    And the large card features COMPARE
    And I am on the home page with the tiles swiped to "MORE COMING" and the theme menu open
    When the window becomes 820 by 1180 CSS pixels
    Then the home page shows its upright layout with the theme menu still open
    And the large card features the same game, and does not rise in again
    And the row of tiles stands at its start, "ALL DINOSAURS" at its left edge
    When the window becomes 1180 by 820 CSS pixels
    Then the home page shows its landscape layout with the theme menu still open
    And the large card does not rise in again, and the row of tiles stands at its start

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I open the home page
    Then no tile, card, button or the version footer sits under them, and the page does not scroll
    And the large card is shorter than with no safe areas by the top and bottom insets
    And the screen's background still reaches the window's edges
