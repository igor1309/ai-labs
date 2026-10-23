Feature: Find the pair: the result in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), find the pair's result
  stands upright in one centred column: the board's dinosaurs at the
  top, then the celebration and the new level, the tries, the stars
  earned, "WELL DONE!", the best and the actions, "PLAY AGAIN", "BACK"
  and "HOME" side by side. The rest is as find-the-pair-result.feature,
  find-the-pair-level-offer-result.feature and
  find-the-pair-collection.feature tell. A tall-narrow window keeps the
  picture asking to turn or widen (window-shape.feature).

  The result's padding is 32 and its parts stand 16 apart, the
  dinosaurs 20 above the rest. "The width" is the window's less its side
  insets and the padding (a scrollbar that takes room narrows it). The
  dinosaurs stand three across, two across for four, the width wide, at
  most 648; their rows share the height the rest of the column leaves,
  each card at most its landscape shape (its picture at 4:3 over its
  name) and at least 90 tall, its name sized from its width as in
  landscape. Where the window leaves the cards less, the whole screen
  scrolls. The celebration and the new level stand side by side where
  they fit, one above the other where they do not. The tries are 15% of
  the window's height, at most 180, beside the hand; the stars earned,
  "WELL DONE!", the best and the actions keep their sizes (48, 48, 48,
  72), and the actions take one type in the window, as large as lets
  the three fit the width in either language, at most 26. Sizes hold to
  within a pixel, the cards' to within 4.

  Scenario Outline: The result stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish <board>
    Then I see no picture asking to turn sideways or to make the window wider
    And the dinosaurs stand at the top, each card <card> CSS pixels tall, and the rewards and actions under them in one centred column
    And the screen <scrolls> up and down

    Examples:
      | width | height | board                                                       | card | scrolls         |
      | 600   | 800    | Hatchling's climb level 1, 3 dinosaurs, a new best and a new level | 157  | does not scroll |
      | 600   | 800    | Hatchling's climb level 2, 4 dinosaurs, a new best and a new level | 112  | does not scroll |
      | 600   | 800    | a Paleontologist board, 12 dinosaurs, a new best             | 90   | scrolls         |
      | 744   | 1133   | Hatchling's climb level 2, 4 dinosaurs, a new best and a new level | 254  | does not scroll |
      | 744   | 1133   | a Paleontologist board, 12 dinosaurs, a new best             | 121  | does not scroll |
      | 768   | 1024   | an Explorer board, 9 dinosaurs, a new best                   | 135  | does not scroll |
      | 768   | 1024   | a Paleontologist board, 12 dinosaurs, a new best             | 98   | does not scroll |
      | 820   | 1180   | an Explorer board, 9 dinosaurs, a new best                   | 180  | does not scroll |
      | 1024  | 1366   | a Paleontologist board, 12 dinosaurs, a new best             | 176  | does not scroll |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When I finish Hatchling's climb with a first best and a new level, and a Paleontologist board
    Then every dinosaur's name and "NEW" stand on one line on their cards, none cut
    And the celebration and the new level each stand on one line
    And "PLAY AGAIN", "BACK" and "HOME" stand side by side, each on one line, at least 22 pixels, none cut
    And "WELL DONE!" and the best each stand on one line

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | scrollbars that take no room |
      | English  | a scrollbar that takes 16    |
      | Russian  | a scrollbar that takes 16    |

  Scenario: The offer of a level comes upright
    Given a window of 820 by 1180 CSS pixels
    When I finish a board that earns the offer of the next level
    Then the offer comes over the result once its rewards have landed, as in landscape
    And it is laid out as compare-dinosaurs-result-portrait.feature tells

  Scenario: The result glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on find the pair's result
    When the window becomes 820 by 1180 CSS pixels
    Then the dinosaurs, the rewards and the actions glide from their old place and size to their new one, together, over 240 ms easing out, as turn-motion.feature tells
    And no card rises in again, no star pops in again and "NEW" does not pop in again
    And under reduced motion the old layout only fades into the new, over 160 ms

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I finish a board
    Then the dinosaurs sit under the top inset and the actions above the home indicator
    And the screen's background still reaches the window's edges
