Feature: A dinosaur's page moves to its other layout as the window turns
  When a dinosaur's page changes layout with the window (an iPad turned
  between landscape and upright, dinosaur-page-portrait.feature), the
  bar, the stage with its picture and its ← and → buttons, and the words
  glide and resize from where they stand to their new places together,
  over the shared standard motion (240 ms, easing out), as
  turn-motion.feature tells. Words and pictures keep their shape. Under
  reduced motion the old layout only fades into the new, over 160 ms.
  Nothing jumps, goes blank, shimmers again or slides in again: the page
  shows the same creature before and after. Until the motion settles,
  taps, swipes and keys do nothing. A resize in a tall window moves
  nothing but what the new size changes, the stage and the picture
  following the window with no glide or fade.

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

  Scenario: Taps during the turn do nothing
    Given a window of 1180 by 820 CSS pixels on the page of Baryonyx
    When the window becomes 820 by 1180 CSS pixels
    And before the motion ends I tap the → button
    Then I am still on the page of Baryonyx once the motion ends

  Scenario: A resize in a tall window
    Given a window of 744 by 1133 CSS pixels on the page of Baryonyx
    When the window becomes 820 by 1180 CSS pixels
    Then the stage, the picture and the words follow the window with no glide or fade, the picture 476 by 357 CSS pixels
