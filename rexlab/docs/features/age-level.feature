Feature: Age level
  The same games serve a child of about 4 and one of about 6. A parent
  picks an approximate age level in a menu beside the language and theme
  menus. Which level each game then starts at is in
  age-level-start.feature, how the menu looks and moves in
  age-level-menu.feature, and the levels themselves in docs/age-levels.md.
  The menu is for parents, but its level names are the children's words
  too, so they are in capitals; the ages are a parents' footnote.

  Background:
    Given an iPad in landscape

  Scenario Outline: The age level menu is for parents
    Given the app is in <language>
    And the age level is Explorer
    When I open the home page
    Then I see a small button with 🦖 in the shaded group of the parents' menus, after the theme menu
    When I tap it
    Then a menu lists, in order, each level's picture, name and age:
      | picture | name             | age     |
      | 🥚      | <hatchling>      | <age 4> |
      | 🦖      | <explorer>       | <age 5> |
      | 🦴      | <paleontologist> | <age 6> |
    And Explorer has a ✓
    When I tap outside the menu
    Then the menu closes and the age level is unchanged

    Examples:
      | language | hatchling | explorer      | paleontologist | age 4       | age 5       | age 6          |
      | English  | HATCHLING | EXPLORER      | PALEONTOLOGIST | about 4     | about 5     | 6 and up       |
      | Russian  | ДЕТЁНЫШ   | ИССЛЕДОВАТЕЛЬ | ПАЛЕОНТОЛОГ    | около 4 лет | около 5 лет | 6 лет и старше |

  Scenario Outline: The level starts at Explorer when none is saved
    Given <saved>
    When I open the home page
    Then the age level button shows 🦖

    Examples:
      | saved                                                    |
      | the app has never been opened on this iPad               |
      | the games have saved progress, but no age level is saved |
      | the saved age level is not one of the three levels       |
      | the browser's storage cannot be read                     |

  Scenario Outline: A chosen level is shown and remembered
    Given the age level is <from>
    When I choose <level> in the age level menu
    Then the menu closes and the button shows <picture>
    When I close and reopen the app
    Then the button still shows <picture>
    When I open the age level menu
    Then <level> has a ✓

    Examples:
      | from           | level          | picture |
      | Explorer       | Hatchling      | 🥚      |
      | Explorer       | Paleontologist | 🦴      |
      | Hatchling      | Explorer       | 🦖      |

  Scenario Outline: A level that cannot be saved still applies until the app closes
    Given <saved>
    And the browser's storage cannot be written
    When I choose Hatchling in the age level menu
    Then the button shows 🥚
    When I close and reopen the app
    Then the button shows <picture>

    Examples:
      | saved                   | picture |
      | no age level is saved   | 🦖      |
      | Paleontologist is saved | 🦴      |

  Scenario Outline: The level outlives the games' progress
    Given I chose Paleontologist
    When the games' saved progress is <lost>
    And I reopen the app
    Then the age level is Paleontologist

    Examples:
      | lost                    |
      | deleted                 |
      | there, but not readable |

  Scenario: Choosing a level changes no score
    Given I have a score in every game that keeps one
    When I choose each age level in turn
    Then every game's saved scores, stars and collection are unchanged
    And no game's start count changes
    And the day's featured game is unchanged
