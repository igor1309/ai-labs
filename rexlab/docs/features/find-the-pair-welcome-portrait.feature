Feature: Find the pair: the welcome in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), find the pair's welcome
  stands upright: the bar with "HOME" on top, then the three cards, the
  face-down card, the silhouette and the picture, centred, and under
  them, centred, the title, the climb level and stars, the level switch
  and "PLAY". The rest is as find-the-pair-start.feature and
  find-the-pair-levels.feature tell. A tall-narrow window keeps the
  picture asking to turn or widen (window-shape.feature).

  The screen keeps its landscape padding top and bottom (40 and 48) and
  is 32 from each side; the bar, the gaps between the column's parts
  (28), the chips and "PLAY" keep their landscape sizes. "The width" is
  the window's less its side insets and that padding (a scrollbar that
  takes room narrows it). The column is the width, at most 648. The
  title, beside its mark, takes one type in the window, as large as lets
  the longer title in either language fit the width on one line, at
  most 64 pixels. The level switch stands upright as on a result
  (compare-dinosaurs-result-portrait.feature): the column's width, each
  level 64 tall, its picture above its name, the names in one type as
  large as lets the longest name fit its third, at most 16. Its upright
  form is the one level switch's, for every game that shows it upright.
  The cards, under the bar (28) and 32 above the title, keep their 3:4
  and their landscape share of the width, each 32% of it, at most 280
  wide, and shrink to the height the column leaves; they are never under
  120 wide, and where the window leaves them less, the whole screen
  scrolls. Sizes hold to within a pixel, the cards' to within 4.

  Scenario Outline: The welcome stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open find the pair
    Then I see no picture asking to turn sideways or to make the window wider
    And the three cards stand under the bar, each <card> CSS pixels wide, and the title, the chips, the level switch and "PLAY" under them in one centred column
    And the screen <scrolls> up and down

    Examples:
      | width | height | card | scrolls         | window                  |
      | 600   | 700    | 120  | scrolls         | Stage Manager, or a Mac |
      | 600   | 800    | 135  | does not scroll | Stage Manager, or a Mac |
      | 744   | 1133   | 218  | does not scroll | iPad mini upright       |
      | 768   | 1024   | 225  | does not scroll | iPad 9.7" upright       |
      | 820   | 1180   | 242  | does not scroll | iPad Air upright        |
      | 1024  | 1366   | 280  | does not scroll | iPad Pro 12.9" upright  |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When I open find the pair at Hatchling, with its climb level and stars shown
    Then the title stands on one line beside its mark, at least 50 pixels, none cut
    And every level's name stands on one line under its picture, at least 14 pixels, none cut
    And the climb level, the stars and "PLAY" each stand on one line, none cut

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | scrollbars that take no room |
      | English  | a scrollbar that takes 16    |
      | Russian  | a scrollbar that takes 16    |

  Scenario: The level switch works upright
    Given a window of 820 by 1180 CSS pixels on find the pair's welcome at Hatchling
    When I tap "EXPLORER" on the level switch
    Then the mark slides to it as in landscape, and the climb level folds away beside the stars

  Scenario: The welcome glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on find the pair's welcome
    When the window becomes 820 by 1180 CSS pixels
    Then the cards, the title, the chips, the level switch and "PLAY" glide from their old place and size to their new one, together, over 240 ms easing out, as turn-motion.feature tells
    And the cards do not rise in again
    And under reduced motion the old layout only fades into the new, over 160 ms

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I open find the pair
    Then the bar sits under the top inset and "PLAY" above the home indicator
    And the screen's background still reaches the window's edges
