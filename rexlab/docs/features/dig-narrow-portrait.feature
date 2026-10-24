Feature: DIG in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), every DIG screen stands upright: 24 pixels above, 32
  below and 20 at the sides, its parts 16 apart, HOME and BACK as
  48-pixel symbols with their words kept for screen readers. A brush
  stroke on the sand neither scrolls the page nor swipes back.

  Scenario Outline: The board stands upright on a phone
    Given a window of <width> by <height> CSS pixels
    When I open DIG
    Then I see no picture asking to turn sideways or to make the window wider
    And HOME and the title fill the bar's first row
    And the brush picker, the FIELD GUIDE and DUG UP share its second row, even with three digits of treasures and every dinosaur dug up

    Examples:
      | width | height |
      | 320   | 568    |
      | 375   | 667    |
      | 393   | 852    |
      | 430   | 932    |

  Scenario Outline: WHO IS IT? lists its names under the sand
    Given a window of <width> by <height> CSS pixels
    And the level is <level>
    When the sand asks WHO IS IT?
    Then its <count> names stand one over another, each a 52-pixel row of its picture beside its name
    And the sand keeps at least 160 pixels of width over them

    Examples:
      | width | height | level          | count |
      | 320   | 568    | Explorer       | 3     |
      | 320   | 568    | Paleontologist | 4     |
      | 430   | 932    | Paleontologist | 4     |

  Scenario Outline: Every name of the question fits a 320-wide phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When a Paleontologist's sand asks WHO IS IT?
    Then every name stays on one line, at least 12 pixels

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario Outline: The FIELD GUIDE shows its finds as rows
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I open the FIELD GUIDE
    Then its title is the book alone
    And its five finds stand one over another, each its picture, name and count in a row
    And every name fits, at least 12 pixels

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 430   | 932    | Russian  |

  Scenario Outline: The reveal scrolls rather than shrink its dinosaur
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I dig up a dinosaur
    Then the dinosaur is at least 140 pixels tall, the screen scrolling if it must
    And DUG UP fits in two rows, even for the last dinosaur with its trophy and badge
    And DIG AGAIN and HOME each fit one line

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 393   | 852    | English  |

  Scenario: The board takes the phone's sizes as the window narrows
    Given DIG's board upright in a tall window
    When the window narrows to 393 by 852
    Then the board stays, in the phone's sizes, with no picture asking to turn
