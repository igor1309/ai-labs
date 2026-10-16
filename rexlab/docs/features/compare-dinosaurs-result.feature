Feature: Compare dinosaurs quiz: the result and the best score
  A finished round shows its score and celebrates a new best score.
  Gamification is essential: a missing celebration is a defect.

  Background:
    Given an iPad in landscape

  Scenario: The round ends with a score
    Given I have answered all 10 questions with 7 correct
    When I tap "See result"
    Then I see "7/10"
    And I see "Play again" and "Home" buttons

  Scenario: Play again starts a new round
    Given I am on the result screen
    When I tap "Play again"
    Then a new round of 10 questions starts
    And I see the progress "1/10"

  Scenario: Home returns to the home page
    Given I am on the result screen
    When I tap "Home"
    Then I am on the home page

  Scenario: A finished round is counted
    Given I have finished 3 rounds
    When I finish another round
    Then I have finished 4 rounds

  Scenario: A new best score is celebrated
    Given my best score so far is 6
    When I finish a round with 7 correct
    Then I see a new best score celebration
    And my best score becomes 7

  Scenario Outline: A score that is not above the best is not celebrated
    Given my best score so far is 7
    When I finish a round with <score> correct
    Then I see no celebration
    And I see my best score 7
    And my best score stays 7

    Examples:
      | score |
      | 7     |
      | 5     |

  Scenario: The first finished round sets the first best
    Given I have never finished a round
    When I finish a round with 4 correct
    Then I see a first best score celebration
    And my best score becomes 4

  Scenario: A first round of 0 is not celebrated
    Given I have never finished a round
    When I finish a round with 0 correct
    Then I see no celebration
    And my best score becomes 0

  Scenario: A round left early is not recorded
    Given my best score so far is 6
    And I have finished 3 rounds
    And I am on question 5 of a round
    When I tap "Home"
    Then I am on the home page
    And my best score stays 6
    And I have finished 3 rounds

  Scenario Outline: Unusable stored progress counts as none
    Given the stored progress is <state>
    When I finish a round with 4 correct
    Then I see "4/10"
    And I see no celebration
    And my best score becomes 4

    Examples:
      | state                          |
      | unreadable                     |
      | from an unknown schema version |

  Scenario: The game works when the browser refuses storage
    Given the browser refuses to store data
    When I finish a round with 4 correct
    Then I see "4/10"
    And I see no best score
    And I see no celebration
