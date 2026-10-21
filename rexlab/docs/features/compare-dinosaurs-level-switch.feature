Feature: Compare dinosaurs quiz: the level switch and its progress
  The quiz has no welcome screen: "COMPARE" starts a round at once, at
  the level it starts at (age-level-start.feature). Its result screen
  shows the level switch above "PLAY AGAIN", as the sorting game's does
  (sort-dinosaurs-level-switch.feature): the child's own choice in this
  game (age-level-choice.feature), kept in the quiz's progress with each
  level's own best. Hatchling and Explorer still ask today's questions, WHO IS
  HEAVIER? and WHO IS TALLER? at a gap of 1.5 times or more
  (compare-dinosaurs-start.feature); Paleontologist also asks WHO IS
  LIGHTER? (compare-dinosaurs-lighter.feature). The levels' own questions
  come in their own issues (docs/age-levels.md). It has no level offer.

  Background:
    Given an iPad in landscape

  Scenario Outline: The first round plays the age level
    Given the age level is <level>
    And I have never used the level switch in the quiz
    When I tap the "COMPARE" tile
    Then the round plays <level>
    And it asks its level's questions, as the compare-dinosaurs features say
    And its result screen shows the level switch with <level> chosen

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: The result screen shows the level switch
    When I finish a round of the quiz
    Then I see the level switch above "PLAY AGAIN": HATCHLING, EXPLORER and PALEONTOLOGIST, youngest first
    And each shows its picture from the age level menu: 🥚, 🦖 and 🦴
    And the chosen level stands out from the other two by more than colour
    And each level is at least 48 by 48 CSS pixels to tap

  Scenario: "PLAY AGAIN" plays the level chosen on the switch
    Given I am on the result screen of a Hatchling round
    When I choose Paleontologist on the level switch and tap "PLAY AGAIN"
    Then a Paleontologist round starts
    And the next round started from the "COMPARE" tile plays Paleontologist too

  Scenario: Choosing a level does not leave the result
    Given I am on the result screen of an Explorer round with "7/10"
    When I choose Hatchling on the level switch
    Then I still see "7/10" and the Explorer best
    And no round starts until I tap "PLAY AGAIN"

  Scenario: Each level keeps its own best
    Given my Explorer best is 6 and I have no Paleontologist best
    When I finish a Paleontologist round with 4 correct
    Then I see a first best score celebration
    And my Paleontologist best becomes 4
    And my Explorer best stays 6
    And the "COMPARE" tile shows 4, the best of the level the quiz plays

  Scenario: A best saved before the quiz had levels is its Hatchling best
    Given my stored best score of 8 was saved before the quiz had levels
    When I choose Hatchling on the level switch
    Then the "COMPARE" tile shows 8
    And the Explorer and Paleontologist levels have no best yet

  Scenario: The child's choice is remembered until a parent changes the level
    Given the age level is Explorer
    When I choose Hatchling on the result screen's level switch
    And I close and reopen the app and tap the "COMPARE" tile
    Then the round plays Hatchling
    When a parent chooses Paleontologist in the age level menu
    And I tap the "COMPARE" tile
    Then the round plays Paleontologist

  Scenario Outline: A choice that cannot be saved holds while the app is open
    Given the age level is Explorer and <saved>
    And the browser can read progress but cannot save it
    When I choose Paleontologist on the level switch and go home and tap "COMPARE"
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
      | language | theme | names                               |
      | English  | light | HATCHLING, EXPLORER, PALEONTOLOGIST |
      | English  | dark  | HATCHLING, EXPLORER, PALEONTOLOGIST |
      | Russian  | light | ДЕТЁНЫШ, ИССЛЕДОВАТЕЛЬ, ПАЛЕОНТОЛОГ |
      | Russian  | dark  | ДЕТЁНЫШ, ИССЛЕДОВАТЕЛЬ, ПАЛЕОНТОЛОГ |
