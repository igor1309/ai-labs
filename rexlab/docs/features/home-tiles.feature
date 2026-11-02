Feature: Home game tiles
  Igor approved the short labels, uniform footers and removal of small-tile
  progress badges on 2026-11-02 (LAB-906). The fixed ratio replaces the
  minimum peek rule; columns may end flush with the viewport. In-game rewards are unchanged.
  Every game except today's featured game appears in fixed order in two
  horizontally scrolling rows. The featured card keeps its full title,
  picture, symbol and progress badge and stays in place while tiles scroll.

  Scenario Outline: Tiles keep their proportions and footer
    Given the screen is <width> by <height> CSS pixels
    And the app is in <language> at any age level
    And every game has earned progress
    When I open Home on days that together show every game as a small tile
    Then every small tile including SOON has width:height 4:3
    And row heights and featured-card geometry follow the Home portrait, narrow-portrait and short-landscape specifications
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
      | width | height | language |
      | 390   | 844    | English  |
      | 390   | 844    | Russian  |
      | 844   | 390    | English  |
      | 844   | 390    | Russian  |
      | 820   | 1180   | English  |
      | 820   | 1180   | Russian  |
      | 1180  | 820    | English  |
      | 1180  | 820    | Russian  |
      | 1440  | 900    | English  |
      | 1440  | 900    | Russian  |

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
    Then SOON has at least 4.5:1 text contrast against its footer

    Examples:
      | theme |
      | light |
      | dark  |
