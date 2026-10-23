Feature: DIG: WHO IS IT? in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, DIG's
  board at Explorer and Paleontologist stands upright as it does at
  Hatchling (dig-board-portrait.feature), with its choice cards side by
  side in one row under the sand: three at Explorer, four at
  Paleontologist. The sand keeps one place and one size through the
  whole round, before the cards show and after. The rest is as
  dig-question.feature tells. The reveal and the field guide still ask
  to turn.

  Scenario Outline: The cards stand in a row under the sand
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    And the level is <level>
    When I open DIG
    Then I see no picture asking to turn sideways or to make the window wider
    And <count> card places stand side by side under the sand, inside the window

    Examples:
      | width | height | level          | count |
      | 744   | 1133   | Explorer       | 3     |
      | 820   | 1180   | Explorer       | 3     |
      | 600   | 1000   | Paleontologist | 4     |

  Scenario Outline: Every name fits its card at the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels at Paleontologist
    When I brush enough of the sand for WHO IS IT?
    Then every card's name fits on one line inside its card

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: Picking a card upright
    Given a window of 820 by 1180 CSS pixels at Explorer, asking WHO IS IT?
    When I pick the dinosaur under the sand
    Then the round goes on to its reveal, which asks to turn sideways
