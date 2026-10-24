Feature: The catalogue in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), the catalogue stands upright as in a tall window, on
  20-pixel sides instead of 56: HOME at the top left, the food chips under
  it, and the cards under them. The chips keep their landscape look in
  one row that scrolls sideways from the window's left edge to its right.
  The cards stand as many to a row as keep each at least 213 wide, as in a
  tall window: one on an iPhone, two from 486 wide, so every name keeps
  its landscape size or larger, on one line.

  Scenario: The catalogue stands upright on an iPhone
    Given a tall-narrow window 320 by 568, 375 by 667, 390 by 844, 393 by 852 or 430 by 932
    When I open the catalogue
    Then it shows the list, not an ask to turn over
    And HOME stands over the chips, and the cards under them, one to a row
    And the page keeps 20 pixels on each side

  Scenario: The chips scroll sideways in one row
    Given a tall-narrow window
    When I open the catalogue
    Then ALL, MEAT, PLANTS and BOTH stand in one row at their landscape look
    And the row scrolls sideways, running to both edges of the window
    And the chosen chip's shadow is not cut off

  Scenario: Every word fits at 320 and 375 wide
    Given a tall-narrow window 320 or 375 wide
    When I open the catalogue in English or Russian
    Then every card's name fits on one line, at least as large as in landscape
    And every card's height, weight and food tag fit its footer

  Scenario: Every tap is large enough
    Given a tall-narrow window
    When I open the catalogue
    Then HOME, every chip and every card are at least 44 pixels each way

  Scenario: Turning keeps the list's place
    Given the catalogue on an iPhone in landscape, scrolled to a row
    When the iPhone turns upright and back
    Then the row's first card stays at the top of the list each way

  Scenario: Growing past 600 wide brings back the tall layout
    Given the catalogue in a tall-narrow window
    When the window grows to 600 by 800
    Then the list takes the tall layout on 56-pixel sides
