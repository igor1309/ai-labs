Feature: Dinosaur care in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), every care screen stands upright: 20 pixels at the
  sides, its parts 16 apart, HOME and BACK as 48-pixel symbols with their
  words kept for screen readers, and the bars' titles as their words
  alone.

  Scenario Outline: The welcome stands upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I open care
    Then I see no picture asking to turn sideways or to make the window wider
    And NEW VISITOR stands over FRIENDS, every word on one line
    And FRIENDS' count of friends fits beside its title, even at two digits

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 430   | 932    | Russian  |

  Scenario Outline: A visit stands upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When a new visitor comes
    Then HOME and the hearts share the bar's first row, the four needs its second
    And the five items stand in one row as their pictures alone, each at least 44 wide
    And the stage keeps at least 200 pixels of height for the visitor
    And a window too short for that scrolls

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 393   | 852    | English  |

  Scenario Outline: FRIENDS stands upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I open FRIENDS
    Then the cards stand two to a row
    And BACK, HOME and the count of friends share the bar's first row, the title kept for screen readers
    And every shipped name fits its card's three lines

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 375   | 667    | English  |

  Scenario Outline: The result stands upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I finish a visit
    Then its eight hearts stand on one row
    And NEW VISITOR, FRIENDS and HOME stand one over another, each on one line

    Examples:
      | width | height | language |
      | 320   | 568    | English  |
      | 320   | 568    | Russian  |
      | 430   | 932    | Russian  |

  Scenario: A visit takes the phone's sizes as the window narrows
    Given a visit upright in a tall window
    When the window narrows to 393 by 852
    Then the visit stays, in the phone's sizes, with no picture asking to turn

  Scenario: FRIENDS with no friends yet fits a phone
    Given a child with no friends yet
    And a window of 320 by 568 CSS pixels
    When I open FRIENDS
    Then the empty nest, its words and NEW VISITOR fit inside the screen

  Scenario: FRIENDS keeps its place as the window narrows to a phone
    Given FRIENDS scrolled to the row of the 21st friend in a wide or tall window
    When the window narrows to 393 by 852
    Then the list stands at the 21st friend's row, two cards to a row
