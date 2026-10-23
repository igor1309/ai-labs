Feature: Sort dinosaurs: the board in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), the sorting board stands
  upright: HOME and the steps, the prompt, the tray and the baskets stand
  one under another as in landscape, the baskets side by side below the
  tray. Play is as sort-dinosaurs-play.feature tells. A tall-narrow
  window keeps the picture asking to turn or widen (window-shape.feature);
  the result stands upright too (sort-dinosaurs-result-portrait.feature).

  The screen's padding is 40 above, 48 below and 32 a side, the bar and
  the prompt 56 tall, and the bar, the prompt, the tray and the baskets
  28 apart. "The width" is the window's less its side insets and the
  padding (a scrollbar that takes room narrows it). The tray's cards
  stand in rows of equal length, two rows of three, four or five for six,
  eight or ten cards, 16 apart across and 12 down, each card at least
  120 wide: where the width cannot hold a row at that, a row takes a card
  fewer and the tray a row more. A card is its picture at 4:3 over its
  name strip, 46 tall for six cards and 38 for eight or ten; it is as
  wide as the width allows, at most 200, and narrower where that leaves
  the baskets less than 320 tall, but never under 120: there the whole
  screen scrolls. The baskets take the rest of the height, 24 apart for
  two and 16 for three, each with 20 inside: its mark above its name, and
  its cards below them. The baskets' names take one type in the window,
  as large as lets the longest word of any basket's name, in either
  language, fit across a basket, at most 34 for two baskets and 28 for
  three; a name breaks only between its words. Sizes hold to within a
  pixel, the cards' to within 4.

  Scenario Outline: The board stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When a round of <cards> cards and <baskets> baskets starts
    Then I see no picture asking to turn sideways or to make the window wider
    And the tray's cards stand in <rows> rows of <across>, each <card> CSS pixels wide
    And the baskets stand side by side under the tray, <tall> CSS pixels tall
    And the screen <scrolls> up and down

    Examples:
      | width | height | cards | baskets | rows | across | card | tall | scrolls         |
      | 744   | 1133   | 6     | 2       | 2    | 3      | 200  | 445  | does not scroll |
      | 744   | 1133   | 8     | 3       | 2    | 4      | 158  | 524  | does not scroll |
      | 744   | 1133   | 10    | 3       | 2    | 5      | 123  | 576  | does not scroll |
      | 768   | 1024   | 6     | 2       | 2    | 3      | 200  | 336  | does not scroll |
      | 768   | 1024   | 10    | 3       | 2    | 5      | 128  | 460  | does not scroll |
      | 820   | 1180   | 8     | 2       | 2    | 4      | 177  | 542  | does not scroll |
      | 1024  | 1366   | 10    | 3       | 2    | 5      | 179  | 725  | does not scroll |
      | 600   | 1000   | 6     | 2       | 2    | 3      | 168  | 360  | does not scroll |
      | 600   | 1000   | 10    | 3       | 3    | 4      | 120  | 320  | scrolls         |
      | 600   | 800    | 8     | 3       | 2    | 4      | 120  | 320  | scrolls         |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When a Hatchling, an Explorer diet and a Paleontologist feathers round start
    Then every dinosaur's name stands on one line on its card, none cut
    And every basket's name stands across its basket, no word cut or broken, in at most two lines, at least 16 pixels
    And HOME stands on one line, and the prompt on one line

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | scrollbars that take no room |
      | English  | a scrollbar that takes 16    |
      | Russian  | a scrollbar that takes 16    |

  Scenario: Cards are dragged and tapped into the baskets upright
    Given a window of 820 by 1180 CSS pixels
    When I drag a card down into its right basket, and tap another into a wrong one
    Then the first lands there with a ✓ and the second slides back with its hint, as in landscape

  Scenario: The board glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on a round with 3 cards sorted, one wrong drop's hint showing and a card picked
    When the window becomes 820 by 1180 CSS pixels
    Then the tray's cards, the baskets and the cards in them glide from their old place and size to their new one, together, over 240 ms easing out, as turn-motion.feature tells
    And no card rises in again and no ✓ stamps in again
    And the 3 cards are still in their baskets, the hint still shows, the card is still picked and the wrong drop still counts
    And under reduced motion the old layout only fades into the new, over 160 ms

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When a round starts
    Then the bar sits under the top inset and the baskets above the home indicator
    And the screen's background still reaches the window's edges
