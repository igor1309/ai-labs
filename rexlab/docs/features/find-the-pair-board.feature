Feature: Find the pair: turning cards
  Two cards are open at most. A match stays open; a miss turns back
  with no "wrong" mark, so trying is never punished.
  Its rules hold at every age level. A scenario that names a climb
  level or a number of tries plays Hatchling, whose climb levels 1 to 4
  these are (find-the-pair-levels.feature).

  Background:
    Given an iPad in landscape
    And a board is dealt

  Scenario: Tapping a face-down card turns it over
    When I tap a face-down card
    Then it flips over to show its dinosaur's picture, silhouette or skeleton
    And it shows a pressed state before it flips

  Scenario: An open card cannot be turned back by tapping
    Given one card is open
    When I tap that card again
    Then it stays open and still counts as the first of the two

  Scenario: Two matching cards stay open
    Given one card shows Triceratops
    When I turn over the other Triceratops card
    Then both cards stay open with a short happy bounce
    And both cards get a green border and the name "TRICERATOPS" in capital letters
    And the name fits on the card, however long a dinosaur's name is
    And the pair counts as found

  Scenario: Two different cards turn back
    Given one card shows Triceratops
    When I turn over a card that shows Stegosaurus
    Then both stay open for about a second
    And then both flip face down again
    And I see no cross, no "wrong" word and no shaking

  Scenario: Taps wait while a miss is shown
    Given two different cards are open
    When I tap a third card before they turn back
    Then the third card stays face down
    And once they have turned back I can turn over any face-down card

  Scenario: A quick double tap turns over one card
    When I tap a face-down card twice quickly
    Then only that card is open
    And no second card has been turned over

  Scenario: Every two cards turned are one try
    When I turn over two cards
    Then my tries for this board go up by one, matched or not
    And I see my tries with a hand symbol in a corner of the board

  Scenario: Finding the last pair finishes the board
    Given every pair but one is found
    When I find the last pair
    Then all cards do a short happy wave
    And then I see the board's result

  Scenario: Home leaves a board without confirmation
    Given I am partway through a board
    When I tap "HOME"
    Then I am on the home page without being asked to confirm
    And that board earns no star, no level step and no found dinosaurs

  Scenario: Back leaves a board for the game's welcome screen
    Given I am partway through a board, with one card open
    Then the board's bar shows "BACK" with an arrow symbol, before "HOME"
    When I tap "BACK"
    Then I see the game's welcome screen with its level switch, without being asked to confirm
    And that board earns no star, no level step and no found dinosaurs
    And its open card does not turn back over later

  Scenario: Portrait pauses a board without changing it
    Given I am partway through a board, with one card open
    When I turn the iPad to portrait
    Then I see a picture asking me to turn sideways
    And I cannot turn a card behind that picture
    When I turn the iPad back to landscape
    Then I see the same cards, open and face down as before, and the same tries

  Scenario: Cards turn smoothly or fade
    When I turn over cards, find a pair and miss a pair
    Then cards flip with the shared motion tokens
    But when the device asks for reduced motion they change with short fades instead
