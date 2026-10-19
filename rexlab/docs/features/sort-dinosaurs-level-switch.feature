Feature: Sort dinosaurs: the level switch and its progress
  The sorting game has no welcome screen: "SORT" starts a round at once,
  at the level it starts at (age-level-start.feature). Its result
  screen shows the level switch above "PLAY AGAIN", the child's own
  choice in this game (age-level-choice.feature), kept in the game's
  progress (sort-dinosaurs-progress.feature). Each level keeps its own
  best (docs/age-levels.md).

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

  Scenario: A choice that cannot be saved holds while the app is open
    Given the age level is Explorer and I have never used the level switch
    And the browser can read progress but cannot save it
    When I choose Paleontologist on the level switch and go home and tap "SORT"
    Then the round plays Paleontologist
    But after reloading the round plays Explorer

  Scenario Outline: Each level keeps its own best
    Given my Hatchling best is 5 and my Explorer best is 6
    And I have never finished a Paleontologist round
    When I finish a <level> round with <right> right
    Then I see <celebration>
    And my <level> best becomes <best>, and my other bests are unchanged

    Examples:
      | level          | right | celebration                    | best |
      | Hatchling      | 6     | a new best score celebration   | 6    |
      | Explorer       | 5     | no celebration                 | 6    |
      | Paleontologist | 3     | a first best score celebration | 3    |

  Scenario: The SORT tile shows the best of the level the game plays
    Given my Hatchling best is 5 and my Explorer best is 7
    When the sorting game plays Explorer
    Then the "SORT" card on the home page shows 7

  Scenario: A best saved before levels is the Hatchling best
    Given my sorting best of 5 was saved before the game had levels
    When I finish a Hatchling round with 5 right
    Then I see no celebration, and my Hatchling best stays 5
    And my Explorer and Paleontologist bests are none

  Scenario Outline: The level switch fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I see the sorting result on a 1024 by 768 screen
    Then the switch, "PLAY AGAIN" and "HOME" all show with no scrolling
    And the switch reads <names>, each on one line, at 4.5:1 contrast

    Examples:
      | language | theme | names                                       |
      | English  | light | HATCHLING, EXPLORER, PALEONTOLOGIST         |
      | Russian  | dark  | ДЕТЁНЫШ, ИССЛЕДОВАТЕЛЬ, ПАЛЕОНТОЛОГ         |
