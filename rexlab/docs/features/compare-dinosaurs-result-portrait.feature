Feature: Compare dinosaurs quiz: the result in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, the result
  places the cheering dinosaur in the sky and the score, ten stars,
  WELL DONE!, available best and earned celebration in the sand.
  The level switch stands above PLAY AGAIN and HOME, which are side by
  side. Dig-site tokens size colours, type, spacing and corners. All
  words remain readable in English and Russian, clear of safe areas.
  The dinosaur keeps its 4:3 proportions and takes the space left by the
  rewards, never below 120 CSS pixels high. If those minimum contents
  cannot fit, the whole page, sky included, scrolls vertically.
  These sizes describe COMPARE; other games keep their own layout.

  Scenario Outline: The result stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a round of the compare dinosaurs quiz with a new best score
    Then no orientation gate covers the result
    And the dinosaur stands at the top at least 120 CSS pixels high
    And the rewards, level switch and actions stand under it in one centred column
    And the screen scrolls vertically only when its minimum content cannot fit

    Examples:
      | width | height |
      | 600   | 800    |
      | 744   | 1133   |
      | 768   | 1024   |
      | 820   | 1180   |
      | 1024  | 1366   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When I finish a round with ten stars, a new best over an earlier one and a celebration
    Then the ten stars stand on one line, each at least 44 pixels
    And every level's name stands on one line under its picture, at least 14 pixels, none cut
    And "PLAY AGAIN" and "HOME" stand side by side, each on one line, none cut
    And the celebration and the best score each stand on one line

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | scrollbars that take no room |
      | English  | a scrollbar that takes 16    |
      | Russian  | a scrollbar that takes 16    |

  Scenario Outline: The offer of a level fits a tall window
    Given the app is in <language>
    And a window of 600 by 800 CSS pixels
    When a game offers the "<level>" level in its dialog
    Then the dialog is the window less 24 a side, at most 710 wide
    And the question is in 32-pixel type, on at most three lines, none cut
    And "YES" and "NOT NOW" stand one above the other, each across the dialog, on one line

    Examples:
      | language | level          |
      | English  | PALEONTOLOGIST |
      | Russian  | ИССЛЕДОВАТЕЛЬ  |

  Scenario: The level switch works upright
    Given a window of 820 by 1180 CSS pixels on the compare quiz's result
    When I tap "EXPLORER" on the level switch
    Then the mark slides to it as in landscape, and the round's stars and score stay

  Scenario: The result glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on the compare quiz's result
    When the window becomes 820 by 1180 CSS pixels
    Then the dinosaur, the rewards, the level switch and the actions glide from their old place and size to their new one, together, over 240 ms easing out, as turn-motion.feature tells
    And the score does not count up again and no star pops in again
    And under reduced motion the old layout only fades into the new, over 160 ms

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I finish a round of the compare dinosaurs quiz
    Then the dinosaur sits under the top inset and the actions above the home indicator
    And the screen's background still reaches the window's edges
