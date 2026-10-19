Feature: A child's own level choice in a game
  A game that offers its own level switch remembers the child's choice
  there, and it wins over the age level (age-level.feature) until a
  parent picks a different level (docs/age-levels.md). Find the pair has
  a switch (find-the-pair-levels.feature), and remembers its choice
  (find-the-pair-level-progress.feature); so do the sorting game, on
  its result screen (sort-dinosaurs-level-switch.feature), the
  skeleton game (skeleton-assembly-levels.feature) and the dig game, on
  its reveal (dig-reveal.feature). These rules are
  checked on the shared rule of age-level-start.feature, given the
  child's choice and the level it was made under.

  Background:
    Given an iPad in landscape

  Scenario Outline: The child's own choice in a game wins until the setting changes
    Given the age level is <setting>
    And a game with all three modes, in which the child chose <choice>
    When I close and reopen the app
    And the game starts again
    Then it plays its <choice> mode
    When a parent chooses <next> in the age level menu
    And I close and reopen the app
    And the game starts again
    Then it plays its <next> mode
    When a parent chooses <setting> in the age level menu
    And the game starts again
    Then it plays its <setting> mode

    Examples:
      | setting   | choice         | next           |
      | Explorer  | Hatchling      | Paleontologist |
      | Hatchling | Paleontologist | Explorer       |

  Scenario: A level changed and changed back drops the child's choice
    Given the age level is Explorer
    And a game with all three modes, in which the child chose Hatchling
    When a parent chooses Paleontologist and then Explorer in the age level menu
    And the game starts again
    Then it plays its Explorer mode

  Scenario Outline: A child's choice never wins again after the saved level is lost
    Given the age level is Explorer
    And a game with all three modes, in which the child chose Hatchling
    When the saved age level is <lost>
    And I reopen the app
    And a parent chooses Paleontologist and then Explorer in the age level menu
    And the game starts again
    Then it plays its Explorer mode

    Examples:
      | lost         |
      | deleted      |
      | not readable |

  Scenario: Choosing the level already set keeps the child's choice
    Given the age level is Explorer
    And a game with all three modes, in which the child chose Hatchling
    When a parent chooses Explorer in the age level menu
    And I close and reopen the app
    And the game starts again
    Then it plays its Hatchling mode
