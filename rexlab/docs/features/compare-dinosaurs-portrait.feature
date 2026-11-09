Feature: Compare dinosaurs quiz: a question in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide, the sky
  holds HOME, progress, the available best and the prompt. Two pocket cards
  stack in the sand, their pictures at 4:3, their names on one line and
  VS (ИЛИ in Russian) centred on the seam. NEXT follows the cards.
  The dig-site tokens size colours, type, spacing and pocket corners.
  The cards share the remaining height equally. Each picture is at least
  150 CSS pixels high; if that minimum cannot fit, the whole page, sky
  included, scrolls vertically. Cards never move when values appear.
  Prompts and names use one fitting type per window and remain readable.

  Scenario Outline: A question stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I start the compare dinosaurs quiz
    Then no orientation gate covers the question
    And the bar stands in the sky and the prompt under it, on one line
    And equal-height cards stack in the sand with VS, or ИЛИ in Russian, centred on their seam
    And each picture is at least 150 CSS pixels high, with its name on one line
    And the screen scrolls vertically only when the content at its minimum sizes cannot fit

    Examples:
      | width | height |
      | 600   | 800    |
      | 744   | 1133   |
      | 768   | 1024   |
      | 820   | 1180   |
      | 1024  | 1366   |

  Scenario Outline: Every word fits the narrowest width
    Given the app is in <language>
    And a window of 600 by 1000 CSS pixels, with no safe areas and <scrollbar>
    When I meet each of the quiz's prompts and each of its dinosaurs
    Then every prompt stands on one line beside its symbol, none cut
    And every name stands on one line in the same type, at least 32 pixels, none cut
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
