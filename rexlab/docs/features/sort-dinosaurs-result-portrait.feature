Feature: Sort dinosaurs: the result in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, sort's
  result stands upright as the compare quiz's does: the cheering dinosaur
  at the top, and under it, in one centred column, the celebration, the
  score, the stars, "WELL DONE!", the best score, the level switch and
  "PLAY AGAIN" and "HOME" side by side. Its parts take the shared result
  parts' upright sizes (compare-dinosaurs-result-portrait.feature); the
  rest is as sort-dinosaurs-result.feature tells. A tall-narrow window
  keeps the picture asking to turn or widen (window-shape.feature).

  Scenario Outline: The result stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a <level> board
    Then I see no picture asking to turn sideways or to make the window wider
    And the result stands in one centred column at the shared result parts' upright sizes for the width

    Examples:
      | width | height | level          |
      | 744   | 1133   | Hatchling      |
      | 820   | 1180   | Explorer       |
      | 600   | 1000   | Paleontologist |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a Paleontologist board with every card right
    Then its stars stand on one line, at the stars' upright size
    And the level names, "PLAY AGAIN" and "HOME" take the shared parts' type, as on the compare quiz's result

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The result glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on sort's result
    When the window becomes 820 by 1180 CSS pixels
    Then the dinosaur, the rewards, the level switch and the actions glide to their new places, as the compare quiz's result does
    And PLAY AGAIN still starts a new board
