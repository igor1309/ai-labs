Feature: The dinosaur catalogue moves to its other layout as the window turns
  When the list of every dinosaur changes layout with the window (an
  iPad turned between landscape and upright, catalogue-portrait.feature,
  or a tall window resized across a change in how many cards stand in a
  row or how the chips stand: spaced, closed up or two by two), "HOME",
  the chips and the list glide and resize from where they stand to
  their new places together, and inside the list each card slides to
  its new place, over the shared standard motion (240 ms, easing out).
  Words and pictures keep their shape. Under reduced motion the old
  layout only fades into the new, over 160 ms. Nothing jumps, goes
  blank, shimmers again or rises in again; the chosen chip stays chosen.
  Until the motion settles, taps, swipes and keys do nothing; a window
  that changes again meanwhile moves each part on from where it is, as
  turn-motion.feature tells. A resize in the same size class that
  changes none of these moves nothing.

  Through any of these the list keeps what the child was looking at,
  judged from before the motion began. A list at its end stays at its
  end. Just back from a dinosaur's page, before any scroll, that
  dinosaur's card stays whole in view. Otherwise the first card of the
  topmost row showing at least half of itself stands in the top row, as
  far as the list scrolls.

  Scenario: The list glides to its upright layout
    Given a window of 1180 by 820 CSS pixels on the list of every dinosaur, "MEAT" chosen
    When the window becomes 820 by 1180 CSS pixels
    Then "HOME", the chips and the list each glide from their old place and size to their new one, together
    And the cards slide to their new places in the list, three to a row, over 240 ms easing out
    And no word or picture is squashed or stretched, no card blanks, shimmers or rises in
    And "MEAT" is still chosen, with the 26 meat-eaters' cards

  Scenario: Reduced motion only fades
    Given the device asks for reduced motion, and a window of 1180 by 820 CSS pixels on the list of every dinosaur
    When the window becomes 820 by 1180 CSS pixels
    Then the landscape list fades into the upright one over 160 ms, nothing moving or resizing

  Scenario Outline: A turn keeps the cards the child was looking at
    Given a window of 1180 by 820 CSS pixels on the list of every dinosaur, scrolled <scrolled>
    When the window becomes 820 by 1180 CSS pixels
    Then <upright>
    When the window becomes 1180 by 820 CSS pixels
    Then <back>

    Examples:
      | scrolled                                        | upright                                         | back                                            |
      | so the row of Gallimimus stands at its top      | Gallimimus's card is first in the top row       | Gallimimus's card is first in the top row       |
      | so 60 pixels of the row of Gallimimus hide      | Gallimimus's card is first in the top row       | Gallimimus's card is first in the top row       |
      | so 200 pixels of the row before Gallimimus hide | Gallimimus's card is first in the top row       | Gallimimus's card is first in the top row       |
      | so the row of Parasaurolophus stands at its top | Parasaurolophus's card is third in the top row  | Spinosaurus's card is third in the top row      |
      | to its end                                      | the list is at its end, the last card whole     | the list is at its end, the last card whole     |

  Scenario: Back from a page, then turned, the dinosaur stays in view
    Given a window of 1180 by 820 CSS pixels on the page of Baryonyx, card 29
    When I tap the "ANCIENT REPTILES" button
    And the window becomes 820 by 1180 CSS pixels
    Then the list stands upright with the card of Baryonyx whole in view, its picture shrunk into it

  Scenario: A turn while the picture shrinks into its card
    Given a window of 1180 by 820 CSS pixels on the page of Baryonyx
    When I tap the "ANCIENT REPTILES" button
    And before the picture has shrunk into its card the window becomes 820 by 1180 CSS pixels
    Then the picture lands in the card's upright place, whole in view, and nothing jumps

  Scenario Outline: A resize in a tall window
    Given a window of <from> CSS pixels on the list of every dinosaur, the row of Gallimimus at its top
    When the window becomes <to> CSS pixels
    Then <moves>, and Gallimimus's card is first in the top row

    Examples:
      | from        | to          | moves                                                 |
      | 744 by 1133 | 820 by 1180 | the cards slide from two to a row to three            |
      | 700 by 1000 | 744 by 1000 | the chips glide from two rows to one, the list with them |
      | 820 by 1180 | 834 by 1194 | the list follows the window with no glide or fade     |

  Scenario: Taps and keys during the motion do nothing
    Given a window of 1180 by 820 CSS pixels on the list of every dinosaur, the card of Triceratops focused
    When the window becomes 820 by 1180 CSS pixels
    And before the motion ends I tap the card of Tyrannosaurus, then press Enter
    Then I am still on the list, and once the motion ends the card of Triceratops is still focused
