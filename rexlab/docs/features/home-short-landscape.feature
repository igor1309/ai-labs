Feature: The home page in a wide-short window
  In a wide-short window, landscape and under 600 CSS pixels tall (an
  iPhone on its side), the home page keeps the landscape row under one
  short bar instead of asking to turn. RexLab's symbol, the greeting and
  the corner share the bar's line, 60 pixels tall, and the large card and
  the tiles share the height below it evenly, on 20-pixel sides past the
  notch. In a window too short for two rows of tiles a child can tap, the
  page scrolls.

  Scenario: The home page keeps the landscape row on an iPhone on its side
    Given a wide-short window 667 by 375, 852 by 393 or 932 by 430
    When I open the home page
    Then it shows the page, not an ask to turn
    And the page keeps 20 pixels on each side, past the notch, on whichever side the notch is
    And the tiles' row reaches into the page's right side, never under the notch
    And the large card and the tiles share the row evenly

  Scenario: The greeting stands on the bar between RexLab and the corner
    Given a wide-short window
    When I open the home page in English or Russian
    Then RexLab, the greeting and the corner stand on one line, 60 pixels tall
    And RexLab and the museum show their symbols alone
    And screen readers still read RexLab and the museum's name
    And every button in the corner is at least 44 pixels each way

  Scenario: The games fill the height under the bar
    Given a wide-short window
    When I open the home page
    Then the large card and the tiles fill the height under the bar
    And each of the two rows of tiles is at least 122 pixels tall
    And in a window too short for that the page scrolls instead

  Scenario: Tiles retain their proportions when the window changes
    Given a wide-short window
    When I open the home page
    Then tiles have width:height 4:3 derived from their actual row height
    And columns and rows are 16 pixels apart
    And a swipe of the row stays at its column when the window changes size

  Scenario: Every word fits
    Given a wide-short window
    When I open the home page in English or Russian, featuring any game
    Then the large card's name fits its card
    And every small tile's title fits on one line in its 48-pixel footer

  Scenario: The parents' menus open whole
    Given a wide-short window
    When I open any of the parents' menus
    Then it opens under the bar, within the window
    And in a window too short for all its choices it scrolls within itself

  Scenario: Growing past 600 tall brings back the landscape layout
    Given the home page in a wide-short window
    When the window grows to 1180 by 820
    Then the page shows the landscape layout with RexLab's name
