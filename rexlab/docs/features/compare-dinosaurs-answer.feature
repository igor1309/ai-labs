# Draft: decisions marked (proposed) are open for review.

Feature: Compare dinosaurs quiz: answering and the result
  Each question takes one tap; the round ends with a score
  that is compared with the best score so far.

  Background:
    Given the app is open on an iPad in landscape

  # Answer

  Scenario: A correct answer
    Given a question "Who is heavier?" about Triceratops and Velociraptor
    When I tap Triceratops
    Then Triceratops is marked correct
    And both cards show their mass
    And the answer counts as correct
    And a "Next" button appears

  Scenario: A wrong answer shows the right one
    Given a question "Who is heavier?" about Triceratops and Velociraptor
    When I tap Velociraptor
    Then Velociraptor is marked wrong
    And Triceratops is marked as the right answer
    And both cards show their mass
    And the answer counts as wrong
    And a "Next" button appears

  Scenario: Only the first tap counts
    Given I have answered the current question
    When I tap either dinosaur card again
    Then nothing changes

  Scenario: Next moves to the following question
    Given I have answered question 3
    When I tap "Next"
    Then I see the progress "4/10"
    And the new question shows no values yet

  Scenario: The last question leads to the result (proposed)
    Given I have answered question 10
    Then the button reads "See result" instead of "Next"

  # Result

  Scenario: The round ends with a score
    Given I have answered all 10 questions with 7 correct
    When I tap "See result"
    Then I see "7/10"
    And I see "Play again" and "Home" buttons

  Scenario: A new best score is celebrated
    Given my best score so far is 6
    When I finish a round with 7 correct
    Then I see a new best score celebration
    And my best score becomes 7

  Scenario Outline: A score that is not above the best is not celebrated
    Given my best score so far is 7
    When I finish a round with <score> correct
    Then I see no new best score celebration
    And I see my best score 7
    And my best score stays 7

    Examples:
      | score |
      | 7     |
      | 5     |

  Scenario: The first finished round sets the first best (proposed)
    Given I have never finished a round
    When I finish a round with 4 correct
    Then I see a first best score celebration
    And my best score becomes 4

  Scenario: An unfinished round is not recorded (proposed)
    Given my best score so far is 6
    And I am on question 5 of a round
    When I leave the round for the home page
    Then my best score stays 6
    And the number of rounds played does not change

  Scenario: The game works when the browser cannot store scores (proposed)
    Given the browser refuses to store data
    When I finish a round
    Then I see my score
    And I see no best score
