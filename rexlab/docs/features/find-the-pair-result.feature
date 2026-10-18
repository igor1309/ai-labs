Feature: Find the pair: stars, levels and the best score
  Every finished board earns a star. Fewer tries is better: each level
  keeps its fewest tries as the best score to beat. At Hatchling, two
  finished boards move the child up a climb level.
  Its rules hold at every age level. A scenario that names a climb
  level or a number of tries plays Hatchling, whose climb levels 1 to 4
  these are (find-the-pair-levels.feature).

  Background:
    Given an iPad in landscape

  Scenario: A finished board shows its result
    Given I am on level 2
    When I finish a board in 7 tries
    Then I see a star fly into my stars, with my stars as a number
    And I see "7" beside a hand symbol
    And I see the board's dinosaurs with their names
    And I see "PLAY AGAIN" and "HOME", each with its symbol

  Scenario: The first board of a level sets and celebrates its first best
    Given I have never finished a board on level 2
    When I finish a level 2 board in 7 tries
    Then I see a first best score celebration
    And my level 2 best becomes 7 tries

  Scenario: Fewer tries than the best is celebrated
    Given my level 2 best is 7 tries
    When I finish a level 2 board in 5 tries
    Then I see a new best score celebration
    And my level 2 best becomes 5 tries

  Scenario Outline: As many or more tries keep the best
    Given my level 2 best is 7 tries
    When I finish a level 2 board in <tries> tries
    Then I still earn a star
    And my level 2 best still reads 7 with a trophy symbol
    And I see no new best score celebration

    Examples:
      | tries |
      | 7     |
      | 11    |

  Scenario: Two finished boards move up a level
    Given I am on level 1 and have finished 1 board on it
    When I finish another level 1 board
    Then I see a level-up celebration showing level 2 and its board
    And "PLAY AGAIN" deals a level 2 board

  Scenario: The top level keeps going
    Given I am on level 4, the top level
    When I finish 2 boards on it
    Then I stay on level 4 and still earn a star for each

  Scenario: A finished board is recorded once
    When I find the last pair
    Then one finished board, its star, its tries and its found dinosaurs are recorded
    And leaving or reloading during the celebration cannot record it twice

  Scenario: Results and celebrations respect reduced motion
    Given the device asks for reduced motion
    When I finish a level 1 board with a new best and a level up
    Then the star, the celebrations and the screen change use short fades
