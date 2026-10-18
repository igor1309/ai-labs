Feature: How the age level menu looks and moves
  The age level menu (age-level.feature) stands with the parents'
  language and theme menus, and opens and closes as they do; the motion
  below is the same for all three. The corner they stand in fits on one
  line as home-museum.feature says.

  Background:
    Given an iPad in landscape

  Scenario Outline: The menu fits and reads in either theme
    Given the app is in <language> and uses the <theme> theme
    When I open the age level menu on a 1024 by 768 screen
    Then the whole menu is on the screen, each name and each age on one line
    And each name and age keeps at least 4.5:1 contrast with the menu
    And the ✓ keeps at least 3:1 contrast with its choice

    Examples:
      | language | theme |
      | English  | light |
      | English  | dark  |
      | Russian  | light |
      | Russian  | dark  |

  Scenario Outline: The parents' menus open and close with motion
    Given the device does not ask for reduced motion
    When I open the <menu> menu
    Then it animates in with the shared motion tokens
    When I choose in it
    Then it animates out with the shared motion tokens
    And the button's new symbol animates in

    Examples:
      | menu      |
      | language  |
      | theme     |
      | age level |

  Scenario Outline: With reduced motion the parents' menus fade
    Given the device asks for reduced motion
    When I open the <menu> menu
    Then it fades in, shortly
    When I tap outside it
    Then it fades out, shortly

    Examples:
      | menu      |
      | language  |
      | theme     |
      | age level |
