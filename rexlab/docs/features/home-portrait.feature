Feature: The home page in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, in Split View or Stage Manager, or a tall Mac window), the
  home page stands upright: the corner and the greeting at the top, the
  large card under them, and under it the row of tiles in the same
  columns of two, order and sideways scroll as in landscape
  (home-tiles.feature). Nothing else changes. A tall-narrow window keeps
  the picture asking to turn or widen (window-shape.feature). Turning
  reflows straight to the other layout; its motion is LAB-375's, the
  owner's call of 2026-10-20 splitting stage 1 into slices.

  The padding, the greeting and the gaps keep their landscape sizes, 292
  CSS pixels in all. The row of tiles takes 36% of the window's height,
  360 to 520 CSS pixels, and runs on to the window's right edge. Its
  columns are 310 wide as in landscape, narrower only where that would
  leave under 24 pixels of the next one peeking in. The large card takes
  the rest, at least 280 tall with its 108-pixel name strip, its picture
  at 4:3, but never wider than the padding leaves; height it cannot use
  stays empty under the tiles. Under 932 tall the page scrolls up and
  down instead of going smaller. Sizes hold to within a pixel. Budgets
  count no safe-area inset (window-fit.feature).

  Scenario Outline: The home page stands upright
    Given a window of <width> by <height> CSS pixels
    And the large card features COMPARE
    When I open the home page
    Then I see no picture asking to turn sideways or to make the window wider
    And "RexLab", the museum button and the parents' menus stand on one line at the top, the greeting under them
    And the large card stands under the greeting, centred, <card> CSS pixels tall with its name strip, its whole picture shown
    And under the large card the row of tiles is <row> CSS pixels tall, showing "ALL DINOSAURS" over "FIND THE PAIR" first
    And every column of tiles is <column> CSS pixels wide, every tile half its column's height
    And at least 24 pixels of the first column that does not fit peek in at the right edge
    And the page <scrolls> up and down, and the version footer overlaps no tile

    Examples:
      | width | height | card | row | column | scrolls         | window                         |
      | 600   | 800    | 280  | 360 | 310    | scrolls         | iPad in Split View, or a Mac   |
      | 768   | 950    | 298  | 360 | 310    | does not scroll | iPad 9.7" upright, in Safari   |
      | 768   | 1024   | 363  | 369 | 310    | does not scroll | iPad 9.7" upright, full screen |
      | 744   | 1060   | 386  | 382 | 310    | does not scroll | iPad mini upright, in Safari   |
      | 744   | 1133   | 433  | 408 | 310    | does not scroll | iPad mini upright, full screen |
      | 834   | 1194   | 472  | 430 | 310    | does not scroll | iPad Pro 11" upright           |
      | 1032  | 1376   | 589  | 495 | 310    | does not scroll | iPad Pro 13" upright           |
      | 900   | 1000   | 348  | 360 | 310    | does not scroll | Mac window, nearly square      |
      | 712   | 1000   | 348  | 360 | 292    | does not scroll | Stage Manager window           |
      | 600   | 1400   | 474  | 504 | 310    | does not scroll | tall Mac window                |

  Scenario: The tiles scroll sideways under the large card
    Given a window of 744 by 1133 CSS pixels
    And the large card features COMPARE
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
    And the museum button keeps its word on one line, and nothing in the corner overlaps "RexLab", the greeting or the large card

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

  Scenario: Turning the window keeps the home page as it was
    Given a window of 1180 by 820 CSS pixels
    And I am on the home page with the tiles swiped to "MORE COMING" and the theme menu open
    When the window becomes 820 by 1180 CSS pixels
    Then the home page shows its upright layout with the theme menu still open
    And the large card features the same game, and does not rise in again
    And the row of tiles stands at its start, "ALL DINOSAURS" at its left edge
    When the window becomes 1180 by 820 CSS pixels
    Then the home page shows its landscape layout with the theme menu still open
