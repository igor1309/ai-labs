Feature: Sort dinosaurs: dragging cards into baskets
  A card dropped in the right basket stays there; a wrong one slides
  back with a hint.

  Background:
    Given an iPad in landscape

  Scenario: A card is dragged into a basket
    Given a round is in progress
    When I drag a dinosaur card and drop it on its right basket
    Then the card lands in that basket and stays there
    And the card is marked with a ✓
    And it counts as right

  Scenario: A wrong drop slides back with a hint
    Given a round is in progress
    When I drop a dinosaur card on the wrong basket
    Then the card slides back to its place
    And the card shows the symbol of its right basket as a hint
    And it counts as wrong, even when I then put it in the right basket

  Scenario: Only the right basket takes a card
    Given a card that I dropped on the wrong basket
    When I drop it on the wrong basket again
    Then it slides back again
    And when I drop it on its right basket it lands there

  Scenario: A card dropped away from the baskets goes back
    Given a round is in progress
    When I drag a dinosaur card and let go away from every basket
    Then the card slides back to its place
    And nothing is counted

  Scenario: A card can be tapped into a basket instead of dragged
    Given a round is in progress
    When I tap a dinosaur card
    Then the card shows it is picked up
    When I tap a basket
    Then the card is dropped on that basket, as if dragged there

  Scenario: A sorted card cannot be moved again
    Given a card has landed in its basket
    When I try to drag or tap it
    Then nothing changes

  Scenario: The board shows how far the round is
    Given I have sorted 2 of the 6 cards
    Then I see the progress "2/6"

  Scenario: The last card leads to the result
    When the last card lands in its basket
    Then I see "SEE RESULT" with a 🏆 symbol

  Scenario: Home leaves the round
    Given a round is in progress
    When I tap "HOME"
    Then I am on the home page without being asked to confirm
    And the round is not recorded

  Scenario: Portrait asks to turn the iPad
    Given I have sorted 3 cards
    When I turn the iPad to portrait and back to landscape
    Then the 3 cards are still in their baskets

  Scenario: Every move animates
    When a card lands, slides back or is picked up
    Then it moves smoothly with the shared motion tokens
    And with reduced motion it changes with a short fade
