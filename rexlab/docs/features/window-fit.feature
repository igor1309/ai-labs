Feature: Every screen fits a landscape window
  Every screen is laid out for a landscape window and fits from the
  smallest iPad to the largest and in a landscape Mac window at least 1024
  CSS pixels wide, with nothing under the iPad's rounded corners or its
  home indicator. The page never pulls to refresh or bounces, and a
  pointer that can hover is shown what it can press (LAB-326). Landscape
  windows under 600 CSS pixels tall (iPhone landscape) or under 1024 wide,
  and the iPhone's notch, are laid out by each screen's own stage (LAB-325).

  Scenario Outline: A landscape window from the iPad mini to a large Mac display
    Given a window of <width> by <height> CSS pixels
    When I open any screen of the app
    Then nothing on it is cut off or overlaps
    And only the parts made to scroll do: the home page's tiles, the catalogue's list and a dinosaur's page
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
    Given an iPad with rounded corners and a home indicator
    When any screen is open, in either landscape direction
    Then no button, card, name or the version footer sits under them
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
    And on a screen with no pointer that can hover, nothing brightens under a finger

  Scenario: Escape closes a menu
    Given a Mac with a keyboard
    And a parents' menu is open
    When I press Escape
    Then the menu closes, and the screen under it keeps its place
