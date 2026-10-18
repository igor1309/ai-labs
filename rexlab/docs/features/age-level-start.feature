Feature: The level a game starts at
  The age level (age-level.feature) picks the level every game starts at.
  A game with no mode for that level plays its nearest lower one, and a
  child's own choice in a game wins until a parent changes the level.
  Rewards are the same at every level (age-levels.md).

  No game has levels yet: each adopts them in its own issue, which
  removes its row from the first scenario and keeps the child's choice
  in its own progress. Until then the rules below are checked on the
  shared rule, with a game's modes given.

  Background:
    Given an iPad in landscape

  Scenario Outline: Today's games play as they do now at every level
    Given the age level is <level>
    When I play <game>
    Then it plays as it did before levels existed

    Examples:
      | game               | level          |
      | the compare quiz   | Paleontologist |
      | the catalogue      | Paleontologist |
      | the care game      | Paleontologist |
      | the sorting game   | Paleontologist |
      | find the pair      | Paleontologist |
      | the skeleton game  | Paleontologist |
      | the compare quiz   | Hatchling      |
      | find the pair      | Explorer       |

  Scenario Outline: The same play earns the same reward at every level
    Given the age level is <level>
    When I answer every question of a compare quiz round right
    Then I score 10 and see the same celebration as at Hatchling

    Examples:
      | level          |
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

  Scenario: The child's own choice in a game wins until the setting changes
    Given the age level is Explorer
    And a game with all three modes, in which the child chose Hatchling
    When the game starts again
    Then it plays its Hatchling mode
    When a parent chooses Paleontologist in the age level menu
    And the game starts again
    Then it plays its Paleontologist mode
    When a parent chooses Explorer in the age level menu
    And the game starts again
    Then it plays its Explorer mode

  Scenario: Choosing the level already set keeps the child's choice
    Given the age level is Explorer
    And a game with all three modes, in which the child chose Hatchling
    When a parent chooses Explorer in the age level menu
    And the game starts again
    Then it plays its Hatchling mode
