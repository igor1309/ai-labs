Feature: Sort dinosaurs: the result in a tall window
  In a tall window (an iPad upright, a tall Stage Manager or Mac window)
  sort's result shows upright with no orientation gate. The dinosaur
  stands above the score, stars, praise, best, level switch and actions.
  The upright dinosaur remains at least 200 CSS pixels high; below the
  minimum content height the whole page scrolls. PLAY AGAIN and HOME stand
  side by side. Level pictures have visible names, one line each.

  Scenario Outline: The result shows upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a <level> board
    Then I see no picture asking to turn sideways or to make the window wider
    And I see the cheering dinosaur, the score, the stars, the praise, the best score, the level switch, "PLAY AGAIN" and "HOME", none cut

    Examples:
      | width | height | level          |
      | 744   | 1133   | Hatchling      |
      | 820   | 1180   | Explorer       |
      | 600   | 1000   | Paleontologist |

  Scenario Outline: Every word fits a narrow tall window
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and scrollbars that take no room
    When I finish a Paleontologist board with every card right
    Then every star shows, none cut
    And the level names, "PLAY AGAIN" and "HOME" read in full, no word cut or broken

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The result glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on sort's result
    When the window becomes 820 by 1180 CSS pixels
    Then the dinosaur, the rewards, the level switch and the actions glide to their new places with the shared turn motion
    And PLAY AGAIN still starts a new board
