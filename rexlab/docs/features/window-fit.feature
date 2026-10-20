Feature: Every screen fits a landscape window
  Every screen RexLab has today is laid out for a landscape window and
  keeps fitting from the smallest iPad to the largest, and in a Mac window
  of any landscape size, with nothing under the notch, the rounded corners
  or the home indicator. Stray gestures never leave the app, and a mouse
  is shown what it can press (LAB-326). iPhone landscape, under 600 CSS
  pixels tall, is laid out by each game's own stage (LAB-325).

  Scenario Outline: A landscape window from the iPad mini to a large Mac display
    Given a window of <width> by <height> CSS pixels
    When I open any screen of the app
    Then nothing on it is cut off or overlaps, and nothing scrolls that did not scroll before
    And its content is at most 1440 CSS pixels wide, centred, with the screen's background filling the window

    Examples:
      | width | height | device                     |
      | 1024  | 768    | iPad, 9.7"                 |
      | 1133  | 744    | iPad mini                  |
      | 1376  | 1032   | iPad Pro, 13"              |
      | 1440  | 900    | Mac window                 |
      | 1920  | 1080   | Mac window on a large display |

  Scenario: Heights follow the visible window
    Given a browser whose toolbars come and go
    When the visible height changes
    Then every screen's height follows the visible window, not the largest it could be

  Scenario: Safe areas stay clear
    Given a device with a notch, rounded corners and a home indicator
    When any screen is open, in either landscape direction
    Then no button, card, name or the version footer sits under them
    And the screen's background still reaches the window's edges

  Scenario: Stray gestures stay in the app
    Given an iPhone or iPad
    When I pull down at the top of a screen, or push past the end of a list
    Then the page neither reloads nor bounces away from the screen
    When I drag a card or a bone starting at the left or right edge of the screen
    Then the drag moves the card or the bone, and the browser does not go back

  Scenario: A mouse is shown what it can press
    Given a Mac with a mouse or trackpad
    When the pointer rests on a button, a tile or a card
    Then the pointer becomes a hand and the button, tile or card shows that it can be pressed
    And on a touch screen nothing shows a hover look

  Scenario: Escape closes a menu
    Given a Mac with a keyboard
    And a parents' menu is open
    When I press Escape
    Then the menu closes, and the screen under it keeps its place
