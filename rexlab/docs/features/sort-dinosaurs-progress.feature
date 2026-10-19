Feature: Sort dinosaurs: stored progress
  The sorting game keeps a best score and a count of finished rounds of
  its own, beside the compare quiz's, in the browser, with a best for
  each level and the child's choice on the level switch
  (sort-dinosaurs-level-switch.feature).

  Background:
    Given an iPad in landscape

  Scenario: A finished round is counted
    Given I have finished 3 rounds of the sorting game
    When I finish another round of it
    Then my stored progress counts 4 finished rounds of the sorting game

  Scenario: A round left early is not recorded
    Given I have finished 3 rounds of the sorting game, with a best score of 4
    And I am in a round of it with 5 cards sorted
    When I tap "HOME"
    Then my best score stays 4 and my finished rounds stay 3

  Scenario: Each game keeps its own best score
    Given my best score of the compare quiz is 9
    And I have never finished a round of the sorting game
    When I finish a round of the sorting game with 2 right
    Then I see a first best score celebration
    And my best score of the compare quiz stays 9

  Scenario: Progress kept before the sorting game is kept
    Given stored progress of the compare quiz from before the sorting game
    When I finish a round of the sorting game
    Then the compare quiz's best score and rounds are unchanged

  Scenario Outline: Unusable stored progress counts as none
    Given the stored progress is <state>
    When I finish a round of the sorting game with 3 right
    Then I see a first best score celebration
    And my best score of the sorting game becomes 3
    And the stored progress is replaced by a readable record

    Examples:
      | state                          |
      | unreadable                     |
      | from an unknown schema version |

  Scenario: Progress that cannot be saved is still celebrated
    Given my best score of the sorting game is 4
    And the browser can read stored progress but not save it
    When I finish a round with 5 right
    Then I see a new best score celebration
    And the stored best score stays 4

  Scenario: The game works when storage cannot be read
    Given the browser cannot read stored progress
    When I finish a round of the sorting game with 4 right
    Then I see "4/6"
    And I see no best score
    And I see no celebration
