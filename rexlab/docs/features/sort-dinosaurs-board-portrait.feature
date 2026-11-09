Feature: Sort dinosaurs: the board in a tall window
  In a tall window (an iPad upright, a tall Stage Manager or Mac window)
  the sorting board plays upright, with no ask to turn sideways. Play is
  as sort-dinosaurs-play.feature tells; a phone upright is in
  sort-dinosaurs-board-narrow-portrait.feature. Where the parts sit, their
  sizes, spacing and type are the design's call, not this spec's: it
  locks only what a child must always be able to see and do.

  Scenario Outline: The board plays upright
    Given a window of <width> by <height> CSS pixels
    When a <level> round starts
    Then I see no picture asking to turn sideways or to make the window wider
    And I see "HOME", the progress steps, the prompt, every card on the tray and every basket, none cut
    And the baskets are below the tray, so a card is dragged down into them
    And the screen does not scroll

    Examples:
      | width | height | level          |
      | 744   | 1133   | Hatchling      |
      | 744   | 1133   | Explorer       |
      | 744   | 1133   | Paleontologist |
      | 768   | 1024   | Paleontologist |
      | 820   | 1180   | Explorer       |
      | 1024  | 1366   | Paleontologist |

  Scenario: A window too short scrolls rather than squeezing the board
    Given a tall window too short to hold the board with every card readable
    When a Paleontologist round starts
    Then every card keeps its picture and its whole name
    And the screen scrolls up and down to reach the baskets

  Scenario Outline: Every word fits a narrow tall window
    Given the app is in <language>
    And a tall window of 600 by 1000 CSS pixels, with <scrollbar>
    When a Hatchling, an Explorer diet and a Paleontologist feathers round start
    Then every dinosaur's name stands on one line on its card, none cut
    And every basket's name reads in full across its basket, no word cut or broken
    And "HOME" and the prompt read in full

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | scrollbars that take no room |
      | English  | a scrollbar that takes room  |
      | Russian  | a scrollbar that takes room  |

  Scenario: Every card and basket is easy to hit upright
    Given a window of 744 by 1133 CSS pixels
    When a Paleontologist round starts
    Then each card and each basket is at least 48 by 48 CSS pixels to tap or drop on

  Scenario: Cards are dragged and tapped into the baskets upright
    Given a window of 820 by 1180 CSS pixels
    When I drag a card down into its right basket, and tap another into a wrong one
    Then the first lands there with a ✓ and the second slides back with its hint, as in landscape

  Scenario: The board glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on a round with 3 cards sorted, one wrong drop's hint showing and a card picked
    When the window becomes 820 by 1180 CSS pixels
    Then the tray's cards, the baskets and the cards in them glide from their old place and size to their new one, together, with the shared motion tokens, as turn-motion.feature tells
    And no card rises in again and no ✓ stamps in again
    And the 3 cards are still in their baskets, the hint still shows, the card is still picked and the wrong drop still counts
    And under reduced motion the old layout only fades into the new

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When a round starts
    Then nothing sits under the top inset or the home indicator
    And the screen's background still reaches the window's edges
