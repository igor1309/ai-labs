Feature: Sort dinosaurs: the result and the best score
  A sorted board ends with its score and stars, like the compare quiz,
  and celebrates a new best score. The sorting game keeps a best score
  of its own.

  Background:
    Given an iPad in landscape

  Scenario: The round ends with a score
    Given I have sorted all 6 cards, 4 of them right on the first drop
    When I tap "SEE RESULT"
    Then I see "4/6" and 4 of 6 stars
    And I see my best score of the sorting game
    And I see "PLAY AGAIN" with a 🔄 symbol and "HOME" with a 🏠 symbol

  Scenario: Play again starts a new round
    Given I am on the result screen of the sorting game
    When I tap "PLAY AGAIN"
    Then a new round of the sorting game starts

  Scenario: The first finished round sets the first best
    Given I have never finished a round of the sorting game
    When I finish a round with 3 right
    Then I see a first best score celebration
    And my best score of the sorting game becomes 3

  Scenario: A new best score is celebrated
    Given my best score of the sorting game is 4
    When I finish a round with 5 right
    Then I see a new best score celebration
    And my best score of the sorting game becomes 5

  Scenario: A score that is not above the best is not celebrated
    Given my best score of the sorting game is 5
    When I finish a round with 5 right
    Then I see no celebration
    And my best score of the sorting game stays 5

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

  Scenario: The game works when storage cannot be read
    Given the browser cannot read stored progress
    When I finish a round of the sorting game with 4 right
    Then I see "4/6"
    And I see no best score
    And I see no celebration
