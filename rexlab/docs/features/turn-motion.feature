Feature: A screen moves to its other layout as the window turns
  When a screen's layout changes with the window (an iPad turned, a Mac
  or Split View window resized across landscape and portrait), the parts
  both layouts share glide and resize from where they stood to where
  they stand now, together, over the shared standard motion (240 ms,
  easing out), while the rest of the page cross-fades. On the home page
  those parts are "RexLab", the corner with any open parents' menu
  moving with its button, the greeting, the large card and the row of
  tiles. Words and pictures keep their shape as their part resizes,
  never squashed or stretched. Under reduced motion the old layout only
  fades into the new one, over 160 ms. Nothing jumps, goes blank, shows
  its loading shimmer again or plays its entrance again. A tap during
  the motion opens nothing; once it settles, taps work as before. A
  resize that keeps the screen's layout moves nothing.

  The row of tiles keeps what the child was looking at: a row at its
  end stays at its end; otherwise its first whole column stays at its
  left edge, as far as the row scrolls. A screen with no layout for the
  new window shows the picture asking to turn or widen, which fades in
  as before and nothing glides (window-shape.feature).

  Scenario Outline: The home page glides to its other layout
    Given a window of <from width> by <from height> CSS pixels
    And I am on the home page with the theme menu open
    When the window becomes <to width> by <to height> CSS pixels
    Then "RexLab", the corner, the greeting, the large card and the row of tiles each glide from their old place and size to their new one, together
    And the theme menu moves with its button, open
    And the motion takes 240 ms and eases out, the rest of the page cross-fading
    And no word or picture is squashed or stretched on the way
    And the large card does not rise in again, and no tile goes blank or shimmers

    Examples:
      | from width | from height | to width | to height |
      | 1180       | 820         | 820      | 1180      |
      | 820        | 1180        | 1180     | 820       |
      | 1440       | 900         | 900      | 1000      |

  Scenario: Reduced motion only fades
    Given the device asks for reduced motion
    And a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    Then the landscape layout fades into the upright one over 160 ms, nothing moving or resizing

  Scenario: A turn keeps the first whole column in view
    Given a window of 1180 by 820 CSS pixels
    And the large card features COMPARE
    And I am on the home page with the tiles swiped so "SKELETONS" is the first whole column
    When the window becomes 820 by 1180 CSS pixels
    Then "SKELETONS" is the first whole column of tiles, at the row's left edge
    When the window becomes 1180 by 820 CSS pixels
    Then "SKELETONS" is again the first whole column, at the row's left edge

  Scenario: A row at its end stays at its end, there and back
    Given a window of 1180 by 820 CSS pixels
    And the large card features COMPARE
    And I am on the home page with the tiles swiped to their end
    When the window becomes 820 by 1180 CSS pixels
    Then the row is at its end, "MORE COMING" whole at its right edge
    When the window becomes 1180 by 820 CSS pixels
    Then the row is at its end again, "MORE COMING" whole at its right edge

  Scenario: A tap during the motion opens nothing
    Given a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    And I tap the large card before the motion ends
    Then I am still on the home page
    And a tap on the large card once the motion ends opens its game

  Scenario Outline: A resize that keeps the layout moves nothing
    Given a window of <from width> by <from height> CSS pixels on the home page
    When the window becomes <to width> by <to height> CSS pixels
    Then the page follows the window with no glide or fade
    And the tiles keep their place in the row

    Examples:
      | from width | from height | to width | to height |
      | 820        | 1180        | 900      | 1180      |
      | 1440       | 900         | 1440     | 560       |

  Scenario: Turning again mid-motion settles on the last layout
    Given a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    And before the motion ends the window becomes 1180 by 820 CSS pixels
    Then the page ends in its landscape layout, every part in its place
    And no part is left half-way or shows twice

  Scenario Outline: A window the screen has no layout for shows the picture
    Given a window of <from width> by <from height> CSS pixels on the <screen>, the device's screen upright when portrait
    When the window becomes <to width> by <to height> CSS pixels
    Then the picture asking to turn sideways fades in over the screen, as before
    And nothing on the screen glides

    Examples:
      | screen              | from width | from height | to width | to height |
      | care welcome screen | 1180       | 820         | 820      | 1180      |
      | home page           | 852        | 393         | 393      | 852       |
