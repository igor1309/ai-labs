Feature: The dinosaur catalogue in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), the list of every
  dinosaur stands upright: "HOME" at the top, the food chips on their own
  row under it, and the cards under them. A row holds as many cards, up
  to four, as keep each card at least as wide as on a 1024 by 768
  landscape iPad, 213 CSS pixels, so a name is never smaller than there:
  fewer cards to a row rather than smaller names. The padding, the gaps
  and the cards' look keep their landscape sizes. The rest is as
  catalogue.feature and catalogue-food-filter.feature tell. A tall-narrow
  window keeps the picture asking to turn or widen (window-shape.feature),
  and so does a dinosaur's page in any portrait window (LAB-377).

  The four chips stand in one row, the food chips sharing the width the
  round "ALL" leaves, each 56 pixels tall, its symbols, word and count on
  one line as large as in landscape, the space around them closing up
  where the width asks. Where even that is too narrow they stand two by
  two, each as wide as the others. Sizes hold to within a pixel. A turn keeps
  the cards the child was looking at, judged from before it: a list at
  its end stays at its end; otherwise the first card of the topmost row
  showing at least half of itself stands in the top row, as far as the
  list scrolls (turn-motion.feature tells the motion).

  Scenario Outline: The list stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I open "ANCIENT REPTILES"
    Then I see no picture asking to turn sideways or to make the window wider
    And "HOME" stands alone at the top, and the food chips are in <rows> under it
    And I see the 52 cards <columns> to a row, each <card> CSS pixels wide, in the order of the dinosaur list

    Examples:
      | width | height | columns | card | rows    | window                        |
      | 600   | 800    | 2       | 234  | two     | Stage Manager, or a Mac       |
      | 744   | 1133   | 2       | 306  | one row | iPad mini upright             |
      | 768   | 1024   | 2       | 318  | one row | iPad 9.7" upright             |
      | 810   | 1080   | 3       | 219  | one row | iPad 10.2" upright            |
      | 820   | 1180   | 3       | 223  | one row | iPad Air upright              |
      | 1024  | 1366   | 4       | 213  | one row | iPad Pro 12.9" upright        |
      | 1400  | 1500   | 4       | 307  | one row | Mac window, wider than an iPad |

  Scenario Outline: Every word fits the tall windows
    Given the app is in <language>
    And a window of <width> by 1000 CSS pixels
    When I open "ANCIENT REPTILES"
    Then the chips are in <rows>, every word and count on one line, none cut or overlapping
    And every chip is at least 56 pixels tall, its word 20 pixels tall
    And every card keeps its name on one line, as large as on a 1024 by 768 landscape iPad or larger, and its height, weight and food tag in one row

    Examples:
      | language | width | rows    |
      | English  | 600   | two     |
      | Russian  | 600   | two     |
      | English  | 744   | one row |
      | Russian  | 744   | one row |
      | Russian  | 680   | two     |

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

  Scenario: Back to the list, then upright, keeps the dinosaur in view
    Given a window of 1180 by 820 CSS pixels on the page of a dinosaur far down the list
    When I tap the "ANCIENT REPTILES" button
    And the window becomes 820 by 1180 CSS pixels
    Then the list stands upright with that dinosaur's card in view, its picture shrunk into it

  Scenario Outline: A turn glides the list and keeps the cards the child was looking at
    Given a window of 1180 by 820 CSS pixels on the list of every dinosaur, scrolled <scrolled>
    When the window becomes 820 by 1180 CSS pixels
    Then "HOME", the chips and the list glide to their new places, the cards sliding in the list, over 240 ms easing out
    And no word or picture is squashed or stretched, no card blanks, shimmers or rises in
    And <kept>
    When the window becomes 1180 by 820 CSS pixels
    Then <kept>

    Examples:
      | scrolled                                    | kept                                          |
      | so the row of Gallimimus stands at its top  | Gallimimus's card is first in the top row     |
      | so 60 pixels of the row of Gallimimus hide  | Gallimimus's card is first in the top row     |
      | so 200 pixels of the row before it hide     | Gallimimus's card is first in the top row     |
      | to its end                                  | the list is at its end, the last card whole   |

  Scenario: A tall-narrow window still shows the picture over the list
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur, the device's screen upright
    When the window becomes 393 by 852 CSS pixels
    Then the picture asking to turn sideways fades in over the list
