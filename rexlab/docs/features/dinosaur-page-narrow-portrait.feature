Feature: A dinosaur's page in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), a dinosaur's page stands upright as in a tall window,
  on 20-pixel sides: the bar at the top, the navy stage under it across
  the width, and the words under the stage. The bar keeps one row: the
  "ANCIENT REPTILES" button shows its book alone, a 56-pixel square,
  and keeps its words for screen readers; the position stands at the
  right. The picture spans the stage, less its 20-pixel padding, at its
  4:3, and the ← and → buttons stand in a row 16 pixels under it, at
  the stage's left and right; the stage is as tall as these, and the
  page scrolls. The two facts stand one over the other, each as wide as
  the words. The description is in 24-pixel type on 35-pixel lines, so
  its longest word fits a 320-pixel window; the name, the food tag, the
  facts and the note keep their tall sizes.

  Every page in one window keeps the same lines for its description and
  its note, enough for the longest in either language: the description
  eight lines where the words are under 295 pixels wide, seven to 310,
  six to 356, five to 428 and four from 429; the note eight under 286,
  seven to 304, six to 402, five to 447 and four from 448. Every tap is
  at least 44 pixels.

  Scenario Outline: The page stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I open the page of Pachycephalosaurus
    Then I see no picture asking to turn sideways or to make the window wider
    And the book button stands at the top left and "10 / 52" at the top right
    And under them the stage spans the width, the picture across it and the ← and → buttons under it
    And under the stage the name, the food tag, the description in <description> lines, the facts one over the other and the note in <note> lines

    Examples:
      | width | height | description | note | window         |
      | 320   | 568    | 8           | 8    | iPhone SE      |
      | 375   | 667    | 6           | 6    | iPhone 8       |
      | 393   | 852    | 6           | 6    | iPhone 15      |
      | 430   | 932    | 5           | 6    | iPhone 15 Plus |

  Scenario Outline: Every word fits a phone's width
    Given the app is in <language>
    And a window of <width> by 667 CSS pixels
    When I open the page of each of the 52 creatures in turn
    Then its name stands on one line, none cut
    And its description and the note take no more than their kept lines
    And each fact's label and value stand on one line

    Examples:
      | language | width |
      | English  | 320   |
      | Russian  | 320   |
      | English  | 375   |
      | Russian  | 375   |

  Scenario: The page turns between a phone's landscape and upright
    Given a window of 852 by 393 CSS pixels on the page of Baryonyx, the device's screen sideways
    When the device's screen turns upright, and the window with it, 393 by 852 CSS pixels
    Then every part of the page glides to its narrow upright place, with no picture asking to turn
    When the screen turns back to landscape
    Then every part glides back
