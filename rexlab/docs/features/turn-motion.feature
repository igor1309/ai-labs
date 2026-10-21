Feature: A screen moves to its other layout as the window turns
  When the window crosses between landscape and portrait (an iPad
  turned, a Mac or Split View window resized across), a screen that has
  a layout for both moves to its other layout with the shared motion
  tokens: each part the two layouts share (on the home page "RexLab",
  the corner, the greeting, the large card and the row of tiles) glides
  and resizes from where it stood to where it stands now, together, in
  one standard motion, while the page around them cross-fades. Under
  reduced motion the old layout only fades into the new one. Nothing
  jumps, flashes blank or plays its entrance again. A resize that stays
  in one size class moves nothing; the layout simply follows the window.
  A screen with no layout for the new window keeps the picture asking to
  turn or widen, which fades in as before (window-shape.feature).

  Scenario Outline: The home page glides to its other layout
    Given a window of <from> CSS pixels
    And I am on the home page
    When the window becomes <to> CSS pixels
    Then "RexLab", the corner, the greeting, the large card and the row of tiles each glide from their old place and size to their new one
    And they move together, over the shared standard motion, easing out
    And the rest of the page cross-fades
    And the large card does not rise in again and no tile flashes

    Examples:
      | from      | to        |
      | 1180×820  | 820×1180  |
      | 820×1180  | 1180×820  |
      | 1440×900  | 900×1000  |

  Scenario: Reduced motion only fades
    Given the device asks for reduced motion
    And a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    Then the landscape layout fades into the upright one, nothing moving or resizing
    And the fade is short, as other screens' fades under reduced motion

  Scenario: A turn keeps what the child is looking at
    Given a window of 1180 by 820 CSS pixels
    And the large card features COMPARE
    And I am on the home page with the tiles swiped so "SKELETONS" is the first whole column, and the theme menu open
    When the window becomes 820 by 1180 CSS pixels
    Then "SKELETONS" is the first whole column of tiles, at the row's left edge
    And the theme menu is still open, the large card still features COMPARE
    When the window becomes 1180 by 820 CSS pixels
    Then "SKELETONS" is again the first whole column, and the theme menu still open

  Scenario: A row swiped to its end stays at its end
    Given a window of 1180 by 820 CSS pixels on the home page
    And the tiles swiped to their end, "MORE COMING" whole at the right edge
    When the window becomes 820 by 1180 CSS pixels
    Then "MORE COMING" is still whole, and the row cannot go further

  Scenario: A resize within one size class moves nothing
    Given a window of 820 by 1180 CSS pixels on the home page
    When the window becomes 900 by 1180 CSS pixels
    Then the page follows the window with no glide or fade
    And the tiles keep their place in the row

  Scenario: Turning again mid-motion settles on the last layout
    Given a window of 1180 by 820 CSS pixels on the home page
    When the window becomes 820 by 1180 CSS pixels
    And before the motion ends the window becomes 1180 by 820 CSS pixels
    Then the page ends in its landscape layout, every part in its place
    And no part is left half-way or shows twice

  Scenario: A turn while a screen without a portrait layout is open
    Given a window of 1180 by 820 CSS pixels on the care welcome screen
    When the window becomes 820 by 1180 CSS pixels
    Then the picture asking to turn sideways fades in over the screen, as before
    And nothing on the screen glides
