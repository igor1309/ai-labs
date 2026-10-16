# Draft: decisions marked (proposed) are open for review.

Feature: Compare dinosaurs quiz: starting a round and asking
  A child picks which of two dinosaurs is heavier or taller,
  ten questions per round, and tries to beat their best score.

  Background:
    Given the app is open on an iPad in landscape

  # Home

  Scenario: The home page offers the quiz as a card
    When I open the home page
    Then I see a "Compare dinosaurs" quiz card

  Scenario: The quiz card brightens under the pointer
    Given I am on the home page
    When I hover over the "Compare dinosaurs" card
    Then the card brightens

  Scenario: Tapping the card starts a round
    Given I am on the home page
    When I tap the "Compare dinosaurs" card
    Then a new round of 10 questions starts
    And I see the progress "1/10"

  # Question

  Scenario Outline: A question shows its attribute and two dinosaurs
    Given a round has started
    When the question compares <attribute>
    Then I see the <symbol> symbol and the prompt "<prompt>"
    And I see two dinosaur cards, each with a picture and a name
    And no values are shown yet

    Examples:
      | attribute | symbol | prompt          |
      | mass      | ⚖️     | Who is heavier? |
      | height    | 📏      | Who is taller?  |

  Scenario: The two dinosaurs are clearly different (proposed)
    When a question is generated
    Then the two dinosaurs are different
    And the larger value is at least 1.5 times the smaller one
    And the same pair does not appear twice in a round
