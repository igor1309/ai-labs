Feature: How the age level menu looks and moves
  The age level menu (age-level.feature) stands with the parents'
  language and theme menus, and opens and closes as they do.

  Background:
    Given an iPad in landscape

  Scenario Outline: The corner still fits on one line
    Given the app is in <language>
    And the screen is <width> by <height> CSS pixels
    When I open the home page
    Then "RexLab", the museum button and the three menus stand on one line
    And nothing in the corner overlaps the greeting or the large card

    Examples:
      | language | width | height |
      | English  | 1024  | 768    |
      | Russian  | 1024  | 768    |
      | Russian  | 1133  | 744    |
      | Russian  | 1366  | 1024   |

  Scenario Outline: The menu fits and reads in either theme
    Given the app is in <language> and uses the <theme> theme
    When I open the age level menu on a 1024 by 768 screen
    Then the whole menu is on the screen, each name on one line
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
