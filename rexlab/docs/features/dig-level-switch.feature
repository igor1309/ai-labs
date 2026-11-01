Feature: Dig: the level switch on the reveal
  The dig game has no welcome screen, so its reveal carries the level
  switch above "DIG AGAIN", as the sorting game's result does
  (sort-dinosaurs-level-switch.feature). The level a round plays comes
  from the age level and the child's choice on the switch
  (age-level-start.feature, age-level-choice.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: The first round plays the age level
    Given the age level is <level>
    And I have never used the level switch in the dig game
    When I tap the "DIG" tile
    Then the round plays <level>
    And its reveal shows the level switch with <level> chosen

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: The reveal shows the level switch
    When I see the reveal
    Then the switch shows HATCHLING, EXPLORER and PALEONTOLOGIST, youngest first, with 🥚, 🦖 and 🦴
    And the chosen level stands out from the other two by more than colour
    And each level is at least 48 by 48 CSS pixels to tap

  Scenario: "DIG AGAIN" plays the level chosen on the switch
    Given I am on the reveal of a Hatchling round
    When I choose Explorer on the level switch and tap "DIG AGAIN"
    Then an Explorer round starts
    And the next round started from the "DIG" tile plays Explorer too

  Scenario: Choosing a level does not leave the reveal
    Given I am on the reveal with "5/52"
    When I choose Paleontologist on the level switch
    Then I still see the dinosaur and "5/52"
    And no round starts until I tap "DIG AGAIN"

  Scenario Outline: Choosing a level moves
    Given the device <motion>
    When I choose another level on the switch
    Then the chosen mark moves to it <how>

    Examples:
      | motion                          | how                           |
      | does not ask for reduced motion | with the shared motion tokens |
      | asks for reduced motion         | with short fades              |

  Scenario: The child's choice is remembered until a parent changes the level
    Given the age level is Explorer
    When I choose Hatchling on the reveal's level switch
    And I close and reopen the app and tap the "DIG" tile
    Then the round plays Hatchling
    When a parent chooses Paleontologist in the age level menu
    And I tap the "DIG" tile
    Then the round plays Paleontologist

  Scenario Outline: A choice that cannot be saved holds while the app is open
    Given the age level is Explorer and <saved>
    And the browser can read progress but cannot save it
    When I choose Paleontologist on the level switch and go home and tap "DIG"
    Then the round plays Paleontologist
    But after reloading the round plays <reloaded>

    Examples:
      | saved                                      | reloaded  |
      | I have never used the level switch         | Explorer  |
      | my saved choice on the switch is Hatchling | Hatchling |

  Scenario Outline: The level switch fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I see a reveal with a new best on a 1024 by 768 screen
    Then the switch reads <names>, each on one line, at 4.5:1 contrast, with no scrolling

    Examples:
      | language | theme | names                               |
      | English  | light | HATCHLING, EXPLORER, PALEONTOLOGIST |
      | Russian  | dark  | ДЕТЁНЫШ, ИССЛЕДОВАТЕЛЬ, ПАЛЕОНТОЛОГ |
