Feature: Home game tiles
  Small tiles share one horizontal scroller with equal columns of two.
  Game order runs down each column before advancing right; SOON is last.
  The featured game is omitted from the tile order and keeps its full title,
  picture, symbol and progress badge. Small tiles have no progress badges.
  Fixed proportions may leave a column flush with the viewport edge.
  In-game rewards and saved progress remain unchanged.

  Scenario Outline: Tiles keep their proportions and footer
    Given the screen is <width> by <height> CSS pixels
    And the app is in <language> at any age level
    And every game has earned progress
    When I open Home on days that together show every game as a small tile
    Then every small tile including SOON has width:height 4:3
    And each small tile is <tile width> by <tile height> CSS pixels within one pixel
    And the featured card is <hero width> by <hero height> CSS pixels within one pixel
    And columns are 16 CSS pixels apart
    And the gap between rows is 16 CSS pixels on a wide-short window and 28 otherwise
    And every game footer is 48 CSS pixels high with 8-pixel padding and a 4-pixel gap
    And every footer has translucent black background with opacity 0.1
    And a 20-pixel outline icon sits in a 24-pixel icon holder beside the title
    And every title is bold 20-pixel text with 24-pixel line height and zero letter spacing
    And every title fits on one line
    And the catalogue book sits in its footer and TEETH uses an outline tooth
    And no small tile shows a progress, count, best-score or star badge

    Examples:
      | width | height | language | tile width | tile height | hero width | hero height |
      | 390   | 844    | English  | 194.67 | 146 | 350 | 292 |
      | 390   | 844    | Russian  | 194.67 | 146 | 350 | 292 |
      | 844   | 390    | English  | 182.67 | 137 | 404 | 290 |
      | 844   | 390    | Russian  | 182.67 | 137 | 404 | 290 |
      | 820   | 1180   | English  | 264.53 | 198.40 | 708 | 463.20 |
      | 820   | 1180   | Russian  | 264.53 | 198.40 | 708 | 463.20 |
      | 1180  | 820    | English  | 274.67 | 206 | 445.72 | 440 |
      | 1180  | 820    | Russian  | 274.67 | 206 | 445.72 | 440 |
      | 1440  | 900    | English  | 328 | 246 | 557.14 | 520 |
      | 1440  | 900    | Russian  | 328 | 246 | 557.14 | 520 |

  Scenario Outline: Home uses short labels without renaming game screens or the featured card
    When I open Home in <language>
    Then its small tiles use <labels> in game order, omitting the featured game
    And tapping each tile opens the same game as its featured card
    And game screens and the featured card retain their full labels

    Examples:
      | language | labels                                                                                                    |
      | English  | COMPARE, EXPLORE, PAIRS, BONES, DIG, SORT, CARE, DRAW, MAZE, PUZZLE, TEETH, COLOR, SOON                       |
      | Russian  | СРАВНИ, ЯЩЕРЫ, ПАРЫ, КОСТИ, КОПАЙ, СОРТИРУЙ, ЗАБОТА, РИСУЙ, ЛАБИРИНТ, ПАЗЛ, ЗУБЫ, РАСКРАСЬ, СКОРО         |

  Scenario: SOON is a picture, not a game
    When I open Home
    Then SOON shows a faded dinosaur silhouette and a lock in its footer
    And it has no pressed state and opens nothing when tapped

  Scenario: Swiping only scrolls the tiles
    When I swipe the tiles starting on SORT
    Then the row scrolls sideways without opening a game or leaving a tile pressed
    And the featured card stays in place
    And I can scroll to SOON and back to the first column

  Scenario: Rotating keeps the scrolled column
    Given I scrolled to a column or to the end of the row
    When the viewport changes orientation or size
    Then the same column or row end remains at the edge using the rendered column widths and gaps
    And the featured game and open parent menu remain unchanged

  Scenario: Returning Home starts the row again
    Given I scrolled the Home tiles
    When I open a game and return Home
    Then the row starts at its first column

  Scenario Outline: SOON remains readable in both themes
    Given the app uses the <theme> theme
    When I open Home
    Then SOON has at least 4.5:1 text contrast against the rendered composite of its translucent footer and tile background

    Examples:
      | theme |
      | light |
      | dark  |
