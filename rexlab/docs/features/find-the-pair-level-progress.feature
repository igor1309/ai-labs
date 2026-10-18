Feature: Find the pair: progress at each age level
  Stars and found dinosaurs count the same at every level; each level
  keeps its own best (docs/age-levels.md). Only Hatchling climbs. The
  child's choice on the level switch is kept in this game's progress
  (find-the-pair-progress.feature) and wins until a parent picks a
  different level (age-level-choice.feature).

  Background:
    Given an iPad in landscape

  Scenario: The child's choice is remembered until a parent changes the level
    Given the age level is Explorer
    When I choose Hatchling on the level switch
    And I close and reopen the app and open find the pair
    Then the level switch shows Hatchling chosen
    When a parent chooses Paleontologist in the age level menu
    And I open find the pair
    Then the level switch shows Paleontologist chosen

  Scenario: A board keeps the level it was dealt at
    Given a board is dealt at Explorer
    When a parent chooses Hatchling in the age level menu before I finish it
    Then the board stays as it was dealt, and its result counts for Explorer

  Scenario Outline: Every level earns a star and finds dinosaurs alike
    Given the level switch shows <level> chosen
    When I finish a board
    Then I earn one star, and the FIND THE PAIR tile counts it
    And the board's dinosaurs are found

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario Outline: Each level keeps its own best
    Given my Explorer best is 14 tries, my level 4 best is 8
    And I have never finished a Paleontologist board
    When I finish a <level> board in <tries> tries
    Then I see <celebration>
    And my <level> best becomes <best>, and my other bests are unchanged

    Examples:
      | level          | tries | celebration                    | best |
      | Explorer       | 12    | a new best score celebration   | 12   |
      | Explorer       | 16    | no best score celebration      | 14   |
      | Paleontologist | 20    | a first best score celebration | 20   |

  Scenario: Only Hatchling climbs
    Given I am on climb level 2 and have finished 1 board on it
    When I finish 2 Explorer boards
    Then I see no level-up celebration
    And I am still on climb level 2, with 1 board finished on it

  Scenario: A large board deals as few of the last board's dinosaurs as it can
    When I finish a Paleontologist board and play again
    Then no two of the new board's dinosaurs are from the same look-alike group
    And it deals a dinosaur from the board before only when too few others are left

  Scenario: Progress saved before levels reads as Hatchling's
    Given find-the-pair progress saved before the game had levels
    When I open find the pair
    Then my stars, climb level, level 1 to 4 bests and found dinosaurs are as saved
    And I have no Explorer or Paleontologist best and no level choice
