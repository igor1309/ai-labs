Feature: Compare dinosaurs quiz: starting a round and asking
  A child picks which of two dinosaurs is heavier or taller,
  ten questions per round, and tries to beat their best score.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the quiz as a card
    When I open the home page
    Then I see a "Compare dinosaurs" quiz card with a picture of two dinosaurs

  Scenario: The quiz card brightens under a pointer
    Given I am on the home page
    When I hover over the "Compare dinosaurs" card with a pointer
    Then the card brightens

  Scenario: A card shows it is pressed
    Given I am on the home page
    When I press the "Compare dinosaurs" card
    Then the card shows a pressed state before the round opens

  Scenario: Tapping the card starts a round
    Given I am on the home page
    When I tap the "Compare dinosaurs" card
    Then a new round of 10 questions starts
    And I see the progress "1/10"

  Scenario: Portrait asks to turn the iPad
    Given I am on question 3 of a round
    When I turn the iPad to portrait
    Then I see a picture asking to turn the iPad sideways
    When I turn the iPad back to landscape
    Then I am on question 3 again

  Scenario Outline: A question shows its attribute and two dinosaurs
    Given a round has started
    When the question compares <attribute>
    Then I see the <symbol> symbol and the prompt "<prompt>"
    And I see two dinosaur cards, each with a picture and a name
    And each name is in large capital letters
    And both pictures are the same size
    And no values are shown yet
    And I see a "Home" button with a 🏠 symbol, away from the dinosaur cards

    Examples:
      | attribute | symbol | prompt          |
      | mass      | ⚖️     | Who is heavier? |
      | height    | 📏      | Who is taller?  |

  Scenario: Every question in a round is a fair pair
    When a round of 10 questions is generated
    Then each question compares mass or height
    And each question's two dinosaurs are different
    And in each question the larger value is at least 1.5 times the smaller
    And no two questions use the same two dinosaurs, whatever they compare

  Scenario: The dinosaur list can always fill a round
    Given the dinosaur list the app ships with
    Then it holds at least 10 different fair pairs for each attribute

  Scenario: Rounds vary
    When I play two rounds in a row
    Then the second round does not repeat the first round's 10 questions
