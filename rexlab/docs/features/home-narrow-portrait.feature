Feature: The home page in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), the home page stands upright as in a tall window, on
  20-pixel sides instead of 56: the corner and the greeting at the top,
  the large card under them, and the row of tiles under it, scrolling
  sideways to the window's right edge. Under
  360 wide (an iPhone with its display zoomed, or a window in Slide Over)
  the corner closes up, the large card's name is a little smaller, and
  the small tiles keep their short labels on one line.

  Scenario: The home page stands upright on an iPhone
    Given a tall-narrow window 320 by 568, 375 by 667, 390 by 844, 393 by 852 or 430 by 932
    When I open the home page
    Then it shows the page, not an ask to turn over
    And the page keeps 20 pixels on each side

  Scenario: The corner keeps one line beside the wordmark
    Given a tall-narrow window 320 or 375 wide
    When I open the home page in English or Russian
    Then RexLab and the museum show their symbols alone
    And screen readers still read RexLab and the museum's name
    And the museum and the parents' menus stay on one line, clear of RexLab's symbol
    And the corner and RexLab end above the greeting
    And every button in the corner is at least 44 pixels each way

  Scenario: The tiles' columns fit the narrow row
    Given a tall-narrow window
    When I open the home page
    Then the tiles have width:height 4:3 derived from the existing row height
    And columns are 16 pixels apart and scroll to the window's right edge

  Scenario: Every word fits at 320 and 375 wide
    Given a tall-narrow window 320 or 375 wide
    When I open the home page in English or Russian, featuring any game
    Then the large card's name fits its card
    And every small tile's short title fits on one line in its 48-pixel footer

  Scenario: Growing past 600 wide brings back the tall layout
    Given the home page in a tall-narrow window
    When the window grows to 768 by 1024
    Then the page takes the tall layout, RexLab's word shown again
