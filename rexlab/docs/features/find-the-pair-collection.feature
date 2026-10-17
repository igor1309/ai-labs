@next
Feature: Find the pair: dinosaurs found in the catalogue
  Every dinosaur matched on a finished board is found, and the
  catalogue shows which dinosaurs the child has found so far, so the
  game fills the book of all dinosaurs.

  Background:
    Given an iPad in landscape

  Scenario: A finished board's dinosaurs become found
    Given I have found no dinosaurs
    When I finish a board with Triceratops, Stegosaurus and Tyrannosaurus
    Then those three dinosaurs are found
    And on the result each of them that was new to me has a "NEW" badge with a sparkle symbol

  Scenario: A dinosaur is found once
    Given Triceratops is found
    When I finish another board with Triceratops
    Then Triceratops is still found once
    And it has no "NEW" badge on that result

  Scenario: The catalogue shows found dinosaurs
    Given I have found Triceratops and Stegosaurus
    When I open "ALL DINOSAURS"
    Then I see the count "2 / 42" with a two-cards symbol beside the title
    And the cards of Triceratops and Stegosaurus have a found stamp with a two-cards symbol
    And no other card has a found stamp
    And the page of Triceratops shows the same stamp

  Scenario: The catalogue shows no count before anything is found
    Given I have never finished a board
    When I open "ALL DINOSAURS"
    Then I see no found count and no found stamps

  Scenario: A board left halfway finds nothing
    Given I have found Triceratops
    When I leave a board halfway after matching Stegosaurus
    Then Stegosaurus is not found
