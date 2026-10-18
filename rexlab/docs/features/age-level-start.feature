Feature: The level a game starts at
  The age level (age-level.feature) picks the level every game starts at.
  A game with no mode for that level plays its nearest lower one, and a
  child's own choice in a game wins until a parent sets the level again.
  Rewards are the same at every level (age-levels.md).

  Each game adopts levels in its own issue; until then the rules below
  hold for the shared rule, given the modes a game offers.

  Background:
    Given an iPad in landscape

  Scenario Outline: Today's games play as they do now at every level
    Given the age level is <level>
    When I play any of today's games
    Then it plays its Hatchling mode, as before levels existed

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
      | offered                      | setting        | played    |
      | Hatchling                    | Paleontologist | Hatchling |
      | Hatchling and Explorer       | Paleontologist | Explorer  |
      | Hatchling and Explorer       | Hatchling      | Hatchling |
      | Hatchling and Paleontologist | Explorer       | Hatchling |
      | all three                    | Explorer       | Explorer  |

  Scenario: The child's own choice in a game wins until the setting changes
    Given the age level is Explorer
    And a game with all three modes, in which the child chose Hatchling
    When the game starts again
    Then it plays its Hatchling mode
    When a parent chooses Paleontologist in the age level menu
    And the game starts again
    Then it plays its Paleontologist mode

  Scenario: Choosing the level already set keeps the child's choice
    Given the age level is Explorer
    And a game in which the child chose Hatchling
    When a parent chooses Explorer in the age level menu
    And the game starts again
    Then it plays its Hatchling mode
