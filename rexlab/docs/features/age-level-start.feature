Feature: The level a game starts at
  The age level (age-level.feature) picks the level every game starts at.
  A game with no mode for that level plays its nearest lower one, and a
  child's own choice in a game wins until a parent picks a different
  level. Rewards are the same at every level, and each level keeps its
  own best score (docs/age-levels.md); a best saved before a game had
  levels is its Hatchling best, shown on its tile or, when it is
  featured, on the large card in its place.

  Find the pair, the sorting game, the skeleton game, the dig game and
  the compare quiz have levels (find-the-pair-levels.feature,
  sort-dinosaurs-levels.feature, skeleton-assembly-levels.feature,
  dig-level-switch.feature, compare-dinosaurs-level-switch.feature). Each other
  game adopts them in its own issue, which removes its row from the
  first scenario and keeps the child's choice in its own progress; the
  catalogue has no levels and keeps its row. The rules below are checked
  on the shared rule, which is given the level, a game's modes and the
  child's choice in it, made under the level as it then stood; the
  child's choice is in age-level-choice.feature.

  Background:
    Given an iPad in landscape

  Scenario Outline: Today's games play as they do now at every level
    When I play <game> at each age level in turn
    Then it starts exactly as it does today, as its own feature says

    Examples:
      | game              |
      | the catalogue     |
      | the care game     |

  Scenario Outline: The same play earns the same reward at every level
    Given the age level is <level>
    And my best compare quiz score at <level> is 6
    When I answer every question of a compare quiz round right
    Then I score 10 and see the new best score celebration
    And the COMPARE tile shows my best score 10, the best of the level the quiz plays

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario Outline: A game starts at the nearest level it has at or below the setting
    Given a game has modes for <offered>
    And the age level is <setting>
    When the game starts
    Then it plays its <played> mode

    Examples:
      | offered                      | setting        | played         |
      | Hatchling                    | Paleontologist | Hatchling      |
      | Hatchling and Explorer       | Paleontologist | Explorer       |
      | Hatchling and Explorer       | Hatchling      | Hatchling      |
      | Hatchling and Paleontologist | Explorer       | Hatchling      |
      | all three                    | Hatchling      | Hatchling      |
      | all three                    | Explorer       | Explorer       |
      | all three                    | Paleontologist | Paleontologist |
