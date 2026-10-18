Feature: Age level
  The same games serve a child of about 4 and one of about 6. A parent
  picks an approximate age level in a menu beside the language and theme
  menus. Which level each game then starts at is in
  age-level-start.feature; the levels themselves are in age-levels.md.

  Background:
    Given an iPad in landscape

  Scenario Outline: The age level menu is for parents
    Given the app is in <language>
    And the age level is Explorer
    When I open the home page
    Then I see a small button with 🦖 in the shaded group of the parents' menus, after the theme menu
    When I tap it
    Then a menu lists, in order, each level's picture, name and age:
      | picture | name             | age        |
      | 🥚      | <hatchling>      | <age 4>    |
      | 🦖      | <explorer>       | <age 5>    |
      | 🦴      | <paleontologist> | <age 6>    |
    And Explorer has a ✓
    When I tap outside the menu
    Then the menu closes and the age level is unchanged

    Examples:
      | language | hatchling | explorer      | paleontologist | age 4       | age 5       | age 6          |
      | English  | HATCHLING | EXPLORER      | PALEONTOLOGIST | about 4     | about 5     | 6 and up       |
      | Russian  | ДЕТЁНЫШ   | ИССЛЕДОВАТЕЛЬ | ПАЛЕОНТОЛОГ    | около 4 лет | около 5 лет | 6 лет и старше |

  Scenario: A new install starts at Explorer
    Given the app has never been opened on this iPad
    When I open the home page
    Then the age level button shows 🦖

  Scenario Outline: A chosen level is shown and remembered
    When I choose <level> in the age level menu
    Then the button shows <picture>
    When I close and reopen the app
    Then the button still shows <picture>
    And the menu ticks <level>

    Examples:
      | level          | picture |
      | Hatchling      | 🥚      |
      | Paleontologist | 🦴      |

  Scenario: The level outlives the games' progress
    Given I chose Paleontologist
    When the games' saved progress is lost
    And I reopen the app
    Then the age level is Paleontologist

  Scenario: An unreadable saved level falls back to Explorer
    Given the saved age level is not one of the three levels
    When I open the app
    Then the age level is Explorer

  Scenario: Choosing a level changes no score
    Given I have a score in every game
    When I choose each age level in turn
    Then every game's score, star and collection is unchanged
    And no game's start count changes

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
    Given the app is in Russian and uses the <theme> theme
    When I open the age level menu on a 1024 by 768 screen
    Then the whole menu is on the screen, each name on one line
    And each name and age keeps at least 4.5:1 contrast with the menu

    Examples:
      | theme |
      | light |
      | dark  |
