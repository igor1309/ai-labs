Feature: The dinosaur catalogue in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), the list of every
  dinosaur stands upright: "HOME" at the top left, the food chips on
  their own row 24 pixels under it, and the cards 28 pixels under them.
  A row holds as many cards, up to four, as keep each card at least as
  wide as on a 1024 by 768 landscape iPad, 213 CSS pixels, so a name is
  never smaller than there: fewer cards to a row rather than smaller
  names. The padding, the gaps and the cards' look keep their landscape
  sizes. The rest is as catalogue.feature and
  catalogue-food-filter.feature tell; a turn is in
  catalogue-turn.feature. A tall-narrow window keeps the picture asking
  to turn or widen (window-shape.feature), and so does a dinosaur's page
  in any portrait window (LAB-377).

  The chips keep their landscape look: 56 pixels tall, "ALL" a round
  button, each food chip's symbols, word and count on one line at their
  landscape sizes. The four stand in one row, each food chip as wide as
  its content and the three sharing out equally what width the row has
  left. Where the row is too narrow, the space in each food chip closes
  up first, its padding to 14 pixels before the symbols and 8 after the
  count, 8 between its parts, and 8 between the chips. Where even that
  is too narrow, "ALL" and "MEAT" stand on the first row and "PLANTS" and
  "BOTH" on the second, 12 pixels apart, at their landscape spacing,
  "ALL" still round and each food chip growing to share its row the same
  way. Sizes hold to within a pixel.

  Scenario Outline: The list stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I open "ANCIENT REPTILES"
    Then I see no picture asking to turn sideways or to make the window wider
    And "HOME" stands alone at the top left, and the food chips are in <rows> under it
    And I see the 52 cards <columns> to a row, each <card> CSS pixels wide, in the order of the dinosaur list

    Examples:
      | width | height | columns | card | rows    | window                         |
      | 600   | 800    | 2       | 234  | two     | Stage Manager, or a Mac        |
      | 744   | 1133   | 2       | 306  | one row | iPad mini upright              |
      | 768   | 1024   | 2       | 318  | one row | iPad 9.7" upright              |
      | 810   | 1080   | 3       | 219  | one row | iPad 10.2" upright             |
      | 820   | 1180   | 3       | 223  | one row | iPad Air upright               |
      | 1024  | 1366   | 4       | 213  | one row | iPad Pro 12.9" upright         |
      | 1400  | 1500   | 4       | 307  | one row | Mac window, wider than an iPad |

  Scenario Outline: Every word fits the tall windows
    Given the app is in <language>
    And a window of <width> by 1000 CSS pixels
    When I open "ANCIENT REPTILES"
    Then the chips are in <rows>, <spacing>, every word and count on one line, none cut or overlapping
    And every chip is 56 pixels tall, "ALL" round, every word 20 pixels tall
    And every card keeps its name on one line, as large as on a 1024 by 768 landscape iPad or larger, and its height, weight and food tag in one row

    Examples:
      | language | width | rows    | spacing                  |
      | English  | 600   | two     | at their landscape space |
      | Russian  | 600   | two     | at their landscape space |
      | Russian  | 700   | two     | at their landscape space |
      | English  | 744   | one row | closed up                |
      | Russian  | 744   | one row | closed up                |
      | Russian  | 820   | one row | at their landscape space |

  Scenario: The cards rise in by the row they stand in
    Given a window of 744 by 1133 CSS pixels
    When I open "ANCIENT REPTILES"
    Then the first two cards fade and rise in one after the other, and the rows below with the second
    When the window becomes 820 by 1180 CSS pixels and I tap "PLANTS"
    Then the first three cards rise in one after the other, and the rows below with the third

  Scenario: Choosing a food upright
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur
    When I tap "MEAT", then "ALL"
    Then I saw only the 26 meat-eaters' cards, three to a row, then all 52

  Scenario: A card opens its page upright, under the picture asking to turn
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur
    When I tap the card of Triceratops
    Then the page of Triceratops opens, its picture growing from the card
    And the picture asking to turn sideways fades in over the page

  Scenario: A tall-narrow window still shows the picture over the list
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur, the device's screen upright
    When the window becomes 393 by 852 CSS pixels
    Then the picture asking to turn sideways fades in over the list

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I open "ANCIENT REPTILES" and scroll the list to its end
    Then "HOME" and the chips sit under the top inset, and the last card stands whole above the home indicator
    And the screen's background still reaches the window's edges
