Feature: Sort dinosaurs: the result and the best score
  A sorted board ends on the compare quiz's result screen: the score,
  one star for each card with a won star for each right one, and the
  best-score celebrations.

  Background:
    Given an iPad in landscape

  Scenario: The round ends with a score
    Given I have sorted all 6 cards, 4 of them right on the first drop
    When I tap "SEE RESULT"
    Then I see "4/6" and 6 stars, 4 of them won, popping in one by one
    And with reduced motion the won stars appear with a short fade
    And I see my best score of the sorting game
    And I see "PLAY AGAIN" with a 🔄 symbol and "HOME" with a 🏠 symbol

  Scenario: Play again starts a new round
    Given I am on the result screen of the sorting game
    When I tap "PLAY AGAIN"
    Then a new round of the sorting game starts

  Scenario: Home from the result returns to the home page
    Given I am on the result screen of the sorting game
    When I tap "HOME"
    Then I am on the home page

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

  Scenario Outline: A score that is not above the best is not celebrated
    Given my best score of the sorting game is 5
    When I finish a round with <score> right
    Then I see no celebration
    And my best score of the sorting game stays 5

    Examples:
      | score |
      | 5     |
      | 3     |

  Scenario: A first round of 0 is not celebrated
    Given I have never finished a round of the sorting game
    When I finish a round with 0 right
    Then I see no celebration and 6 stars, none of them won
    And my best score of the sorting game becomes 0
