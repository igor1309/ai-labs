Feature: Skeleton assembly: Paleontologist
  Paleontologist builds each skeleton from its own cut of ten to twelve
  plain pieces (skeleton-assembly-pictures.feature, docs/skeleton-levels.md)
  on a partial outline: the skeleton's shape as a flat silhouette, with no
  bone drawn in it, so the child places each bone by its shape alone. Two
  or three bones of the other dinosaurs wait in the tray among its own.
  Such a bone has no home: dropped anywhere it floats back, and a short
  line says whose bone it is. Nothing is lost and there is no fail state.
  Help climbs its steps as Explorer's does
  (skeleton-assembly-help-ladder.feature), only ever for the skeleton's
  own bones.

  Background:
    Given an iPad in landscape
    And the level switch shows Paleontologist chosen

  Scenario Outline: The tray mixes in other dinosaurs' bones
    When I tap <dinosaur>
    Then the tray shows its <count> pieces, in an order shuffled for this puzzle, with <others> bones of other dinosaurs spread among them
    And the counter shows "0/<count>"

    Examples:
      | dinosaur      | count | others |
      | Tyrannosaurus | 11    | 3      |
      | Triceratops   | 10    | 3      |
      | Stegosaurus   | 10    | 3      |
      | Brachiosaurus | 10    | 3      |
      | Spinosaurus   | 10    | 3      |

  Scenario: The outline shows the skeleton's shape, not its bones
    When I tap Tyrannosaurus
    Then the outline is the skeleton's silhouette in one flat colour
    And no bone's picture is drawn in it

  Scenario Outline: The silhouette holds in either theme
    Given the app uses the <theme> theme
    When I tap Stegosaurus
    Then the silhouette is the <theme> theme's own outline colour

    Examples:
      | theme |
      | light |
      | dark  |

  Scenario: Another dinosaur's bone floats back and says whose it is
    Given I am building Tyrannosaurus
    When I drop the Triceratops frill anywhere on the outline
    Then it floats back to its spot in the tray
    And a line reads "THAT'S THE TRICERATOPS FRILL!"
    And nothing is fitted and nothing is lost

  Scenario: The line goes the moment another piece is touched
    Given the line reads "THAT'S THE TRICERATOPS FRILL!"
    When I press the skull in the tray
    Then the line is gone while I still hold the skull

  Scenario: The line stays while the same bone is touched again
    Given the line reads "THAT'S THE TRICERATOPS FRILL!"
    When I press the Triceratops frill in the tray
    Then the line still reads "THAT'S THE TRICERATOPS FRILL!"

  Scenario: Another dinosaur's bone touched counts help's time again
    Given 9 seconds have passed
    When I drop the Triceratops frill on the outline
    And another second passes
    Then no help shows
    When 9 more seconds pass
    Then help's first step shows for the head, as Explorer's does

  Scenario: Help waits while I turn a piece, then comes for it
    When I tap the arms again and again for 10 seconds
    Then no help shows
    When 10 seconds pass without a touch
    Then help's first step shows for the arms

  Scenario: The skeleton is complete once its own bones fit
    Given I am building Triceratops with nine of its pieces fitted
    When I fit its last piece
    Then the counter shows "10/10"
    And the other dinosaurs' bones leave the tray
    And the reveal shows, earning the Triceratops star once, as at Hatchling

  Scenario Outline: The other levels are unchanged
    Given the level switch shows <level> chosen
    When I tap Triceratops
    Then the outline shows its bones, faint, and the tray holds only its own <count> pieces

    Examples:
      | level     | count |
      | Hatchling | 4     |
      | Explorer  | 6     |
