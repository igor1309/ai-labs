Feature: Compare dinosaurs quiz: starting a round and asking
  A child picks which of two dinosaurs is heavier or taller,
  ten questions per round, and tries to beat their best score.
  home-tiles.feature tells how the games' tiles stand and scroll, and
  home-featured-card.feature how the large card features a game.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the quiz as a tile
    When I open the home page
    Then I see a "COMPARE" tile with a scales symbol and a picture of two dinosaurs
    And on a day another game is featured it is the first tile of the row, above "ALL DINOSAURS"
    And it shows my best score with a trophy symbol when there is one

  Scenario: The quiz tile brightens under a pointer
    Given I am on the home page
    When I hover over the "COMPARE" tile with a pointer
    Then the tile brightens

  Scenario: The tile shows it is pressed
    Given I am on the home page
    When I press the "COMPARE" tile
    Then the tile shows a pressed state before the round opens

  Scenario: Tapping the tile starts a round
    Given I am on the home page
    When I tap the "COMPARE" tile
    Then a new round of 10 questions starts
    And I see the progress "1/10"

  Scenario: The first question opens at once
    Given I am on the home page
    And the pictures of question 1 are still loading
    When I tap the "COMPARE" tile
    Then I see the progress "1/10" at once, its pictures shimmering

  Scenario: A quick double tap on the tile starts one round
    Given I am on the home page
    When I tap the "COMPARE" tile twice quickly
    Then one round starts, at "1/10"

  Scenario: A round starts once for two activations from home
    Given the large card features COMPARE
    When I tap the large card twice, more than 100 CSS pixels apart, before the first tap's screen change is shown
    Then one round starts, at "1/10"
    And COMPARE counts one more start

  Scenario: Portrait asks to turn sideways
    Given I am on question 3 of a round
    When I turn the iPad to portrait
    Then I see a picture asking to turn sideways
    When I turn the iPad back to landscape
    Then I am on question 3 again

  Scenario Outline: A question shows its attribute and two dinosaurs
    Given a round has started
    When the question compares <attribute>
    Then I see the <symbol> symbol and the prompt "<prompt>"
    And I see two dinosaur cards, each with a picture of its own dinosaur and its name
    And each name is in large capital letters
    And both pictures are the same size
    And no values are shown yet
    And I see a "HOME" button with a 🏠 symbol, away from the dinosaur cards

    Examples:
      | attribute | symbol | prompt          |
      | mass      | ⚖️     | WHO IS HEAVIER? |
      | height    | 📏      | WHO IS TALLER?  |

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

  Scenario: Every dinosaur in the list has its own picture
    Given the shipped dinosaur list
    Then every dinosaur has a body picture
    And all body pictures have the same width and height
