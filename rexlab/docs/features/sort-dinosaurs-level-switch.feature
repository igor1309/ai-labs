Feature: Sort dinosaurs: the level switch and its progress
  The sorting game has no welcome screen: "SORT" starts a round at once,
  at the level it starts at (age-level-start.feature). Its result
  screen shows the level switch above "PLAY AGAIN", the child's own
  choice in this game (age-level-choice.feature), kept in the game's
  progress with each level's own best (sort-dinosaurs-progress.feature).
  It has no level offer: a child moves up on the switch, and the offer
  stays with find the pair (owner, LAB-295).

  Background:
    Given an iPad in landscape

  Scenario Outline: The first round plays the age level
    Given the age level is <level>
    And I have never used the level switch in the sorting game
    When I tap the "SORT" card
    Then the round plays <level>
    And its result screen shows the level switch with <level> chosen

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: The result screen shows the level switch
    When I finish a round of the sorting game
    Then I see the level switch above "PLAY AGAIN": HATCHLING, EXPLORER and PALEONTOLOGIST, youngest first
    And each shows its picture from the age level menu: 🥚, 🦖 and 🦴
    And the chosen level stands out from the other two by more than colour
    And each level is at least 48 by 48 CSS pixels to tap

  Scenario: "PLAY AGAIN" plays the level chosen on the switch
    Given I am on the result screen of a Hatchling round
    When I choose Paleontologist on the level switch and tap "PLAY AGAIN"
    Then a Paleontologist round starts
    And the next round started from the "SORT" card plays Paleontologist too

  Scenario Outline: Choosing a level moves
    Given the device <motion>
    When I choose another level on the switch
    Then the chosen mark moves to it <how>

    Examples:
      | motion                          | how                           |
      | does not ask for reduced motion | with the shared motion tokens |
      | asks for reduced motion         | with short fades              |

  Scenario: Choosing a level does not leave the result
    Given I am on the result screen of an Explorer round with "5/8"
    When I choose Hatchling on the level switch
    Then I still see "5/8" and the Explorer best
    And no round starts until I tap "PLAY AGAIN"

  Scenario: The child's choice is remembered until a parent changes the level
    Given the age level is Explorer
    When I choose Hatchling on the result screen's level switch
    And I close and reopen the app and tap the "SORT" card
    Then the round plays Hatchling
    When a parent chooses Paleontologist in the age level menu
    And I tap the "SORT" card
    Then the round plays Paleontologist

  Scenario Outline: A choice that cannot be saved holds while the app is open
    Given the age level is Explorer and <saved>
    And the browser can read progress but cannot save it
    When I choose Paleontologist on the level switch and go home and tap "SORT"
    Then the round plays Paleontologist
    But after reloading the round plays <reloaded>

    Examples:
      | saved                                      | reloaded  |
      | I have never used the level switch         | Explorer  |
      | my saved choice on the switch is Hatchling | Hatchling |

  Scenario Outline: The level switch fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I see a Paleontologist result with a new best on a 1024 by 768 screen
    Then its 10 stars, the switch, "PLAY AGAIN" and "HOME" all show with no scrolling
    And the switch reads <names>, each on one line, at 4.5:1 contrast

    Examples:
      | language | theme | names                                       |
      | English  | light | HATCHLING, EXPLORER, PALEONTOLOGIST         |
      | English  | dark  | HATCHLING, EXPLORER, PALEONTOLOGIST         |
      | Russian  | light | ДЕТЁНЫШ, ИССЛЕДОВАТЕЛЬ, ПАЛЕОНТОЛОГ         |
      | Russian  | dark  | ДЕТЁНЫШ, ИССЛЕДОВАТЕЛЬ, ПАЛЕОНТОЛОГ         |
