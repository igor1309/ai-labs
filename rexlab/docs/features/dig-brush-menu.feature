Feature: Dig: the brush menu on a phone
  On a phone upright the bar has no room for the brush picker's pair of
  buttons (dig-brush-picker.feature), so the title's brush becomes a menu
  of the two brushes. The frames are the "Dig · iPhone upright" row of
  ../../design/rexlab.pen.

  Background:
    Given a window 393 by 852 CSS pixels, an iPhone upright

  Scenario Outline: The title's brush opens the brushes
    Given a <language> round has started
    Then the bar shows HOME, the brush menu's button, the title and the FIELD GUIDE, in one row
    And the button is DIG's amber brush with the picked brush's dot, read out as "<menu>"
    When I tap it
    Then a menu hangs under it with "<brush>" and "<wide>", each beside its dot, the picked one ticked
    When I pick "<wide>"
    Then the menu closes, the wide brush is picked and no sand is cleared

    Examples:
      | language | menu    | brush | wide          |
      | English  | BRUSHES | BRUSH | WIDE BRUSH    |
      | Russian  | КИСТИ   | КИСТЬ | ШИРОКАЯ КИСТЬ |

  Scenario: A tap outside closes the menu and does nothing else
    Given the brush menu is open
    When I tap the sand
    Then the menu closes, no sand is cleared and the brush stays

  Scenario: The menu rests once the right name is picked
    Given an Explorer's sand asks WHO IS IT?
    When I pick the right name
    Then the brush menu's button cannot be tapped until the next round

  Scenario: Larger windows keep the pair of buttons
    Given an iPad in landscape
    Then DIG's bar shows the brush picker's pair of buttons and no brush menu
