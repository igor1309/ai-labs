Feature: DIG: the reveal in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, DIG's
  reveal stands upright: the dinosaur dug up across the width, its name,
  DUG UP and the level switch under it, and DIG AGAIN over HOME, each as
  wide as the screen leaves them. The offer of the next level comes
  upright over it. The rest is as dig-reveal.feature and
  dig-level-offer.feature tell. The field guide still asks to turn.

  Scenario Outline: The reveal stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I dig up a dinosaur at Hatchling
    Then I see no picture asking to turn sideways or to make the window wider
    And the dinosaur stands over its name, DUG UP, the level switch, DIG AGAIN and HOME

    Examples:
      | width | height |
      | 744   | 1133   |
      | 820   | 1180   |
      | 600   | 1000   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels
    When I dig up a dinosaur
    Then the dinosaur's name, DUG UP, every level's name, DIG AGAIN and HOME fit on one line

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: The next level is offered upright
    Given a window of 820 by 1180 CSS pixels at Hatchling, two strong rounds dug up
    When I dig up a third dinosaur without a wrong pick
    Then the offer of Explorer shows over the reveal, with YES and NOT NOW
