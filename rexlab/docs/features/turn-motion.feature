Feature: A screen moves to its other layout as the window turns
  When a screen's layout changes with the window (an iPad turned, a Mac
  or Split View window resized across landscape and portrait), the parts
  both layouts share glide and resize from where they stand to their new
  places together, over the shared standard motion (240 ms, easing out),
  while the rest of the page cross-fades. On the home page those parts
  are "RexLab", the corner with any open parents' menu moving with its
  button, the greeting, the large card and the row of tiles, inside
  which the tiles slide to their new places. Words and pictures keep
  their shape, never squashed or stretched. Under reduced motion the old
  layout only fades into the new, over 160 ms. Nothing jumps, goes
  blank, shimmers again or replays its entrance. Focus stays where it
  was. Until the motion settles, taps, swipes and keys do nothing.

  Should the window change again during the motion, each part glides on
  from where it is to where the latest size puts it, over a fresh motion,
  and input waits for that to settle; under reduced motion it fades
  again, and a size with no layout fades in the picture. A resize that
  keeps the layout moves nothing, the row following the window.

  Through any resize the row keeps what the child was looking at, judged
  from before the motion began: a row that scrolls and stands at its end
  stays at its end; otherwise the leftmost column showing at least half
  of itself stays at the left edge, as far as the row scrolls. A row that
  does not scroll counts as at its start. Where the new window has no
  layout for the screen, the picture asking to turn or widen fades in
  and nothing glides; where it goes, it fades out over the screen's new
  layout (window-shape.feature).

  Scenario Outline: The home page glides to its other layout
    Given a window of <from width> by <from height> CSS pixels
    And I am on the home page with the theme menu open
    When the window becomes <to width> by <to height> CSS pixels
    Then "RexLab", the corner, the greeting, the large card and the row of tiles each glide from their old place and size to their new one, together
    And the theme menu moves with its button, open, the tiles slide in the row, the rest cross-fades, over 240 ms easing out
    And no word or picture is squashed or stretched, no tile blanks or shimmers, the large card does not rise in again

    Examples:
      | from width | from height | to width | to height |
      | 1180       | 820         | 820      | 1180      |
      | 820        | 1180        | 1180     | 820       |
      | 1440       | 900         | 900      | 1000      |

  Scenario: Reduced motion only fades
    Given the device asks for reduced motion, and a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    Then the landscape layout fades into the upright one over 160 ms, nothing moving or resizing

  Scenario Outline: A turn keeps the tiles the child was looking at, there and back
    Given a window of 1180 by 820 CSS pixels, the large card featuring COMPARE
    And I am on the home page with the tiles swiped <swiped>
    When the window becomes 820 by 1180 CSS pixels
    Then <kept>
    When the window becomes 1180 by 820 CSS pixels
    Then <kept>

    Examples:
      | swiped                                         | kept                                                     |
      | so "SKELETONS" stands exactly at its left edge | "SKELETONS" stands at the row's left edge                |
      | so 60 pixels of "SKELETONS" are hidden         | "SKELETONS" stands at the row's left edge                |
      | so 200 of "ANCIENT REPTILES" are hidden        | "SKELETONS" stands at the row's left edge                |
      | to their end                                   | the row is at its end, "MORE COMING" whole at its right  |

  Scenario: Taps and keys during the motion do nothing
    Given a window of 1180 by 820 CSS pixels on the home page, the large card focused
    When the window becomes 820 by 1180 CSS pixels
    And before the motion ends I tap the large card, then press Enter
    Then I am still on the home page, and once the motion ends the large card is still focused
    And pressing Enter then opens its game, as would a tap more than 500 ms after the first's release

  Scenario Outline: A resize that keeps the layout moves nothing
    Given a window of <from width> by <from height> CSS pixels on the home page, "SKELETONS" at the row's left edge
    When the window becomes <to width> by <to height> CSS pixels
    Then the page follows the window with no glide or fade, "SKELETONS" still at the row's left edge

    Examples:
      | from width | from height | to width | to height |
      | 820        | 1180        | 712      | 1180      |
      | 1440       | 900         | 1440     | 560       |

  Scenario Outline: A window that changes again mid-motion
    Given a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    And half-way through the motion the window becomes <width> by <height> CSS pixels
    Then every part glides on from where it is, with no jump, and ends in the <layout> layout, none half-way or shown twice

    Examples:
      | width | height | layout    |
      | 1180  | 820    | landscape |
      | 900   | 1180   | upright   |

  Scenario Outline: A window the screen has no layout for shows the picture
    Given a window of <from width> by <from height> CSS pixels on the <screen>, the device's screen upright when portrait
    When the window becomes <to width> by <to height> CSS pixels
    Then the picture asking to turn sideways fades in over the screen, and nothing on it glides

    Examples:
      | screen              | from width | from height | to width | to height |
      | care welcome screen | 1180       | 820         | 820      | 1180      |
      | home page           | 852        | 393         | 393      | 852       |
