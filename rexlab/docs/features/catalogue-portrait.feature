Feature: The dinosaur catalogue in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), the list of every
  dinosaur stands upright: "HOME" and the food chips in one row at the
  top left, and the cards 28 pixels under them.
  A row holds as many cards, up to four, as keep each card at least as
  wide as on a 1024 by 768 landscape iPad, 213 CSS pixels, worked out
  from the window's width less its side insets and the padding (a
  scrollbar that takes room narrows the cards, never their count), so
  a name is never smaller than there: fewer cards to a row rather than
  smaller names. The padding, the gaps and the cards' look keep their landscape
  sizes. The rest is as catalogue.feature and
  catalogue-food-filter.feature tell; a turn is in
  catalogue-turn.feature, and a dinosaur's page upright in
  dinosaur-page-portrait.feature. A tall-narrow window, under 600 wide,
  has its own layout.

  All four chips show only their food symbols, with no visible words or
  counts. Each is 56 pixels square, with 12 pixels between chips, on the
  same row as HOME. Localized accessible names and selected states remain.
  The chips never stack or scroll sideways in portrait.

  Scenario Outline: The list stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open "ANCIENT REPTILES"
    Then I see no picture asking to turn sideways or to make the window wider
    And "HOME" and all four icon-only food chips stand in one row at the top left
    And I see the 52 cards <columns> to a row, each <card> CSS pixels wide, in the order of the dinosaur list

    Examples:
      | width | height | columns | card | window                         |
      | 600   | 800    | 2       | 234  | Stage Manager, or a Mac        |
      | 744   | 1133   | 2       | 306  | iPad mini upright              |
      | 768   | 1024   | 2       | 318  | iPad 9.7" upright              |
      | 810   | 1080   | 3       | 219  | iPad 10.2" upright             |
      | 820   | 1180   | 3       | 223  | iPad Air upright               |
      | 1024  | 1366   | 4       | 213  | iPad Pro 12.9" upright         |
      | 1400  | 1500   | 4       | 307  | Mac window, wider than an iPad |

  Scenario Outline: Every word fits the tall windows
    Given the app is in <language>
    And a window of <width> by 1000 CSS pixels
    When I open "ANCIENT REPTILES"
    Then HOME and all four icon-only chips fit in one row without clipping or overlapping
    And every chip is 56 pixels square with its localized accessible name and no visible word or count
    And every card keeps its name on one line, as large as on a 1024 by 768 landscape iPad or larger, and its height, weight and food tag in one row

    Examples:
      | language | width |
      | English  | 600   |
      | Russian  | 600   |
      | Russian  | 700   |
      | English  | 744   |
      | Russian  | 744   |
      | Russian  | 820   |

  Scenario: The cards rise in by the row they stand in
    Given a window of 744 by 1133 CSS pixels
    When I open "ANCIENT REPTILES"
    Then the first two cards fade and rise in one after the other, and the rows below with the second
    When the window becomes 820 by 1180 CSS pixels and, once the list settles, I tap "PLANTS"
    Then the first three cards rise in one after the other, and the rows below with the third

  Scenario: Choosing a food upright
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur
    When I tap "MEAT"
    Then I see only the 26 meat-eaters' cards, three to a row
    When I tap "ALL"
    Then I see all 52 cards

  Scenario: A tall-narrow window stands the list one card to a row
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur, the device's screen upright
    When the window becomes 393 by 852 CSS pixels
    Then no picture asks me to turn or widen the window
    And the cards stand one to a row

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I open "ANCIENT REPTILES" and scroll the list to its end
    Then "HOME" and the chips sit under the top inset, and the last card stands whole above the home indicator
    And the screen's background still reaches the window's edges
