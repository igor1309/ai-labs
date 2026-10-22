Feature: Compare dinosaurs quiz: a question in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, a Stage Manager or tall Mac window), a question of the
  compare dinosaurs quiz stands upright: the bar at the top as in
  landscape, "HOME", the steps and the position; under it the prompt;
  under the prompt the two cards, one above the other, each across the
  width; under them the row kept for "NEXT", at the right. Side by side
  the cards would leave a name too little room: one above the other,
  every name keeps its landscape type. The rest is as
  compare-dinosaurs-answer.feature and the other compare-dinosaurs
  features tell. A tall-narrow window keeps the picture asking to turn
  or widen (window-shape.feature).

  The page's padding, the bar, the gaps between the bar, the prompt, the
  cards and the row (32), the prompt's symbol, the cards' look, their
  marks, the values' chips, "VS" and "NEXT" keep their landscape sizes.
  "The width" below is the window's less its side insets and the
  padding (56 a side; a scrollbar that takes room narrows it). The
  prompt stands on one line, in the same type for every prompt in one
  window, as large as lets the longest prompt in either language fit
  beside its symbol, and at most 44 pixels. The two cards are 24 apart,
  share equally the height the bar, the prompt and the row leave, and
  "VS" stands on the seam between them, centred, over both. A card's
  name, in its landscape 34-pixel type, stands on one line under its
  picture; once the question is answered, the card's value stands in
  its chip at the bottom right of the picture's area, 24 from its
  edges, so no card grows or moves when the values show. The picture,
  at its 4:3 and at most 560 by 420, is as large as the card's picture
  area allows less its padding (24). It is never under 150 pixels
  tall; where the window leaves it less, the whole screen scrolls, the
  row for "NEXT" under the cards. Sizes hold to within a pixel, the
  picture's to within 4.

  Scenario Outline: A question stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I start the compare dinosaurs quiz
    Then I see no picture asking to turn sideways or to make the window wider
    And the bar stands at the top and the prompt under it, on one line
    And the two cards stand one above the other, each <card> CSS pixels tall, "VS" on the seam between them
    And each card's picture is <picture> CSS pixels, its name on one line under it
    And the screen <scrolls> up and down

    Examples:
      | width | height | card | picture    | scrolls         | window                  |
      | 600   | 800    | 281  | 200 by 150 | scrolls         | Stage Manager, or a Mac |
      | 744   | 1133   | 370  | 320 by 240 | does not scroll | iPad mini upright       |
      | 768   | 1024   | 316  | 247 by 186 | does not scroll | iPad 9.7" upright       |
      | 820   | 1180   | 394  | 351 by 264 | does not scroll | iPad Air upright        |
      | 1024  | 1366   | 487  | 475 by 356 | does not scroll | iPad Pro 12.9" upright  |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When I meet each of the quiz's prompts and each of its dinosaurs
    Then every prompt stands on one line beside its symbol, none cut
    And every name stands on one line in 34-pixel type, none cut
    And every value stays inside its chip, on one line, inside the picture's area

    Examples:
      | language | scrollbar                    |
      | English  | scrollbars that take no room |
      | Russian  | scrollbars that take no room |
      | English  | a scrollbar that takes 16    |
      | Russian  | a scrollbar that takes 16    |

  Scenario: An answer shows upright
    Given a window of 820 by 1180 CSS pixels on the question "WHO IS HEAVIER?" about Triceratops and Velociraptor
    When I tap Triceratops
    Then Triceratops is marked correct with a ✓, its mark at the top left of its picture
    And both cards show their mass at the bottom right of their pictures
    And neither card grows or moves
    And "NEXT" appears at the right of its row, under the cards

  Scenario: The next question slides in upright
    Given a window of 820 by 1180 CSS pixels on an answered question
    When I tap "NEXT"
    Then the old pair leaves and the new pair enters, each card in its own place, one above the other

  Scenario: The question glides to its other layout as the window turns
    Given a window of 1180 by 820 CSS pixels on an answered question
    When the window becomes 820 by 1180 CSS pixels
    Then the bar, the prompt, each card and the row for "NEXT" glide from their old place and size to their new one, together, over 240 ms easing out, as turn-motion.feature tells
    And the question, its marks and its values stay as they were
    And under reduced motion the old layout only fades into the new, over 160 ms

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I start the compare dinosaurs quiz
    Then the bar sits under the top inset and the row for "NEXT" above the home indicator
    And the screen's background still reaches the window's edges
