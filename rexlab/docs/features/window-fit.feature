Feature: Every screen fits a landscape window
  Every screen is laid out for a landscape window and fits from the
  smallest iPad to the largest and in a landscape Mac window at least 1024
  by 670 CSS pixels, with nothing under rounded corners, a home indicator
  or a notch. The page never pulls to refresh or bounces, and a pointer
  that can hover is shown what it can press (LAB-326). Landscape windows
  under 670 CSS pixels tall (iPhone landscape among them) or under 1024
  wide are laid out by each screen's own stage (LAB-325).

  The tests lay nothing out, so fit is the budget each fit test keeps: a
  screen's named parts measured in ems of the font and CSS pixels against
  the window, as the existing fit features do. Budgets count no safe-area
  inset: the iPad's home indicator takes about 20 CSS pixels at the
  bottom of a full-screen window, which still leaves it taller than the
  Safari rows below.

  Scenario Outline: A landscape window from the iPad mini to a large Mac display
    Given a window of <width> by <height> CSS pixels
    When I open any screen of the app
    Then its content is at most 1440 CSS pixels wide, centred, with the screen's background filling the window
    And every existing fit budget that is measured against the window keeps it at this size

    Examples:
      | width | height | device                        |
      | 1024  | 690    | iPad, 9.7", in Safari         |
      | 1024  | 768    | iPad, 9.7", full screen       |
      | 1133  | 670    | iPad mini, in Safari          |
      | 1133  | 744    | iPad mini, full screen        |
      | 1376  | 1032   | iPad Pro, 13"              |
      | 1440  | 900    | Mac window                 |
      | 1920  | 1080   | Mac window on a large display |

  Scenario: Heights follow the visible window
    Given a browser whose toolbars come and go
    When the visible height changes
    Then every screen's height follows the visible window, not the largest it could be

  Scenario: Safe areas stay clear
    Given a device with rounded corners, a home indicator or a notch
    When any screen is open, in either landscape direction
    Then no button, card, name or the version footer sits under them, whether or not the rest of the screen fits yet
    And the screen's background still reaches the window's edges

  Scenario: The page does not pull or bounce
    Given an iPhone or iPad
    When I pull down at the top of a screen, or push past the end of a list
    Then the page neither reloads nor bounces away from the screen

  Scenario: A pointer that can hover is shown what it can press
    Given a Mac, or an iPad with a trackpad or a mouse
    When the pointer rests on a button, a tile or a card
    Then the button, tile or card brightens
    And on a Mac the pointer becomes a hand
    And a finger never brightens anything, even on an iPad with a trackpad

  Scenario: Escape closes a menu
    Given a Mac with a keyboard
    And a parents' menu is open
    When I press Escape
    Then the menu closes, and the screen under it keeps its place
