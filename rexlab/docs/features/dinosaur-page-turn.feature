Feature: A dinosaur's page moves to its other layout as the window turns
  When a dinosaur's page changes layout with the window (the window
  turning between wide and tall, an iPad turned or a window resized,
  dinosaur-page-portrait.feature, or a tall window resized across a
  change in the lines kept for the description or the note), the bar,
  the stage with its picture and its ← and → buttons, and the words
  glide and resize from where they stand to their new places together,
  over the shared standard motion (240 ms, easing out), as
  turn-motion.feature tells. Words and pictures keep their shape. Under
  reduced motion the old layout only fades into the new, over 160 ms.
  Nothing jumps, goes blank, shimmers again or slides in again: the page
  shows the same creature before and after. Until the motion settles,
  taps, swipes and keys do nothing, and focus stays where it was. Any
  other resize in a tall window glides nothing: the page follows the
  window. A page that scrolls shows from its top after a turn.

  A turn while the picture grows from its card, or while the next or
  previous creature slides in, lets that motion end in the new layout:
  the picture lands in the stage's new place and size, and the creature
  sliding in arrives there whole, nothing jumping.

  Scenario: The page glides to its upright layout
    Given a window of 1180 by 820 CSS pixels on the page of Baryonyx
    When the window becomes 820 by 1180 CSS pixels
    Then the bar, the stage with its picture and buttons, and the words each glide from their old place and size to their new one, together, over 240 ms easing out
    And no word or picture is squashed or stretched, and the picture neither blanks nor shimmers
    When the window becomes 1180 by 820 CSS pixels
    Then they glide back to the landscape page of Baryonyx

  Scenario: Reduced motion only fades
    Given the device asks for reduced motion, and a window of 1180 by 820 CSS pixels on the page of Baryonyx
    When the window becomes 820 by 1180 CSS pixels
    Then the landscape page fades into the upright one over 160 ms, nothing moving or resizing

  Scenario: Taps and keys during the turn do nothing
    Given a window of 1180 by 820 CSS pixels on the page of Baryonyx, the → button focused
    When the window becomes 820 by 1180 CSS pixels
    And before the motion ends I tap the → button, then press Enter
    Then once the motion ends I am still on the page of Baryonyx, the → button still focused

  Scenario: A turn while the picture grows from its card
    Given a window of 1180 by 820 CSS pixels on the list of every dinosaur
    When I tap the card of Triceratops
    And before the picture has grown into the stage the window becomes 820 by 1180 CSS pixels
    Then the picture lands in the upright stage, 476 by 357 CSS pixels, and nothing jumps

  Scenario: A turn while the next creature slides in
    Given a window of 1180 by 820 CSS pixels on the page of Baryonyx
    When I tap the → button
    And before the page of Apatosaurus has slid in the window becomes 820 by 1180 CSS pixels
    Then the page of Apatosaurus arrives whole in the upright layout, and nothing jumps

  Scenario Outline: A resize in a tall window
    Given the app is in Russian, and a window of <from> CSS pixels on the page of Baryonyx
    When the window becomes <to> CSS pixels
    Then <moves>

    Examples:
      | from        | to          | moves                                                                                     |
      | 744 by 1133 | 820 by 1180 | the stage and the words glide to their new places, three lines kept for the description, not four |
      | 820 by 1180 | 834 by 1194 | the page follows the window with no glide or fade                                        |
