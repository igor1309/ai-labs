Feature: Compare dinosaurs quiz: the result and the best score
  A finished round shows its score and celebrates a new best score.
  Gamification is essential: a missing celebration is a defect.

  Background:
    Given an iPad in landscape

  Scenario: The round ends with a score
    Given I have answered all 10 questions with 7 correct
    When I tap "SEE RESULT"
    Then I see "7/10"
    And I see my best score
    And I see "PLAY AGAIN" with a 🔄 symbol and "HOME" with a 🏠 symbol

  Scenario: Play again starts a new round
    Given I am on the result screen
    When I tap "PLAY AGAIN"
    Then a new round of 10 questions starts
    And I see the progress "1/10" at once, its pictures shimmering

  Scenario: Home returns to the home page
    Given I am on the result screen
    When I tap "HOME"
    Then I am on the home page

  Scenario: A finished round is counted in stored progress
    Given my stored progress counts 3 finished rounds
    When I finish another round
    Then my stored progress counts 4 finished rounds

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
    And my stored progress counts 3 finished rounds
    And I am on question 5 of a round
    When I tap "HOME"
    Then I am on the home page without being asked to confirm
    And my best score stays 6
    And my stored progress counts 3 finished rounds

  Scenario Outline: Unusable stored progress counts as none
    Given the stored progress is <state>
    When I finish a round with 4 correct
    Then I see a first best score celebration
    And my best score becomes 4
    And the stored progress is replaced by a readable record

    Examples:
      | state                          |
      | unreadable                     |
      | from an unknown schema version |

  Scenario: The game works when storage cannot be read
    Given the browser cannot read stored progress
    When I finish a round with 4 correct
    Then I see "4/10"
    And I see no best score
    And I see no celebration

  Scenario: Progress that cannot be saved is still celebrated
    Given my best score so far is 6
    And the browser can read stored progress but not save it
    When I finish a round with 7 correct
    Then I see a new best score celebration
    And the stored best score stays 6
