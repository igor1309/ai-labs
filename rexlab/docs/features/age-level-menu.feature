Feature: How the age level menu looks and moves
  The age level menu (age-level.feature) stands with the parents'
  language and theme menus and shares their look and motion. Today
  those menus grow in but vanish at once; with this feature all three
  animate both ways, and their ✓ reads in both themes. The corner they
  stand in fits on one line as home-museum.feature says.

  Background:
    Given an iPad in landscape

  Scenario Outline: The age level menu fits and reads in either theme
    Given the app is in <language> and uses the <theme> theme
    When I open the age level menu on a 1024 by 768 screen
    Then the whole menu is on the screen, each name and each age on one line
    And each name and age keeps at least 4.5:1 contrast with the menu

    Examples:
      | language | theme |
      | English  | light |
      | English  | dark  |
      | Russian  | light |
      | Russian  | dark  |

  Scenario Outline: The ✓ reads in every parents' menu
    Given the app uses the <theme> theme
    When I open the <menu> menu
    Then its ✓ keeps at least 3:1 contrast with the chosen row

    Examples:
      | menu      | theme |
      | language  | light |
      | language  | dark  |
      | theme     | light |
      | theme     | dark  |
      | age level | light |
      | age level | dark  |

  Scenario Outline: The parents' menus open and close with motion
    Given the device does not ask for reduced motion
    When I open the <menu> menu
    Then it animates in with the shared motion tokens
    When I choose in it
    Then it animates out with the shared motion tokens
    And the button's new symbol or code animates in
    When I open it again and tap outside it
    Then it animates out with the shared motion tokens

    Examples:
      | menu      |
      | language  |
      | theme     |
      | age level |

  Scenario Outline: With reduced motion the parents' menus fade
    Given the device asks for reduced motion
    When I open the <menu> menu
    Then it fades in, shortly
    When I choose in it
    Then it fades out, shortly
    And the button's new symbol or code fades in, shortly
    When I open it again and tap outside it
    Then it fades out, shortly

    Examples:
      | menu      |
      | language  |
      | theme     |
      | age level |
