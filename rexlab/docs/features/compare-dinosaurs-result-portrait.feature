Feature: Compare dinosaurs quiz: the result in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), the compare quiz's
  result stands upright in one column: the cheering dinosaur at the
  top, centred, and under it, centred, the celebration, the score, the
  stars, "WELL DONE!", the best score, the level switch and the
  actions, "PLAY AGAIN" and "HOME" side by side. The rest is as
  compare-dinosaurs-result.feature and compare-dinosaurs-level-switch.feature
  tell. A tall-narrow window has its own upright result.

  The result's padding (32), the gaps between its parts (16), the
  celebration, "WELL DONE!", the best score and the actions keep their
  landscape sizes. "The width" is the window's less its side insets and
  the padding (a scrollbar that takes room narrows it). The score is
  15% of the window's height, at most 180 pixels. The stars stand on
  one line, as large as lets ten fit the width with their gaps (8), at
  most 48 pixels. The level switch is the width, at most 648, each
  level 64 tall, its picture standing above its name; its names take one type in
  the window, as large as lets the longest name in either language fit
  its third of the switch, at most 16 pixels. The dinosaur, at its 4:3,
  takes the height the column leaves, 20 above the celebration, at most
  480 tall and the width wide. It is never under 200 tall; where the
  window leaves it less, the whole screen scrolls. These parts, as the
  other results' (find the pair, sort, care, skeletons, DIG's reveal),
  are the shared result parts: their upright sizes hold wherever a
  result stands upright. Sizes hold to within a pixel, the dinosaur's
  to within 4.

  Scenario Outline: The result stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a round of the compare dinosaurs quiz with a new best score
    Then I see no picture asking to turn sideways or to make the window wider
    And the dinosaur stands at the top, <dinosaur> CSS pixels tall, and the rewards, the level switch and the actions under it in one centred column
    And the screen <scrolls> up and down

    Examples:
      | width | height | dinosaur | scrolls         | window                  |
      | 600   | 800    | 200      | scrolls         | Stage Manager, or a Mac |
      | 744   | 1133   | 431      | does not scroll | iPad mini upright       |
      | 768   | 1024   | 338      | does not scroll | iPad 9.7" upright       |
      | 820   | 1180   | 471      | does not scroll | iPad Air upright        |
      | 1024  | 1366   | 480      | does not scroll | iPad Pro 12.9" upright  |

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
