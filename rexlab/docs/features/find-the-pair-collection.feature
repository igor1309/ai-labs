Feature: Find the pair: dinosaurs found in the catalogue
  Every dinosaur matched on a finished board is found, and the
  catalogue shows which dinosaurs the child has found so far, so the
  game fills the book of all dinosaurs.
  Its rules hold at every age level. A scenario that names a climb
  level or a number of tries plays Hatchling, whose climb levels 1 to 4
  these are (find-the-pair-levels.feature).

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

  Scenario: The catalogue does not mark found dinosaurs
    Given I have found Triceratops and Stegosaurus
    When I open "ANCIENT REPTILES"
    Then I see no count of the found and no found stamp over any card's artwork
    And the page of Triceratops has no found stamp either

  Scenario: A board left halfway finds nothing
    Given I have found Triceratops
    When I leave a board halfway after matching Stegosaurus
    Then Stegosaurus is not found
