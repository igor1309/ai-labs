Feature: Skeleton assembly: Explorer
  Explorer builds each skeleton from its own cut of six to eight pieces
  on the full outline (skeleton-assembly-levels.feature,
  docs/skeleton-levels.md). Every piece and slot is plain, as at the
  other levels: the child places each bone by its shape, never by
  matching a colour, which made it a find-the-same-picture task
  (docs/game-design.md, LAB-389). Pieces stay the right way up and fit
  as near their homes as Hatchling's do.

  Background:
    Given an iPad in landscape
    And the level switch shows Explorer chosen

  Scenario Outline: Explorer's puzzle is the skeleton's own cut
    When I tap <dinosaur>
    Then its full outline shows with <count> pieces in the tray, the right way up, in an order shuffled for this puzzle, so the tray never lists the bones head to tail
    And the counter shows "0/<count>"

    Examples:
      | dinosaur      | count |
      | Tyrannosaurus | 7     |
      | Triceratops   | 6     |
      | Stegosaurus   | 7     |
      | Brachiosaurus | 6     |
      | Spinosaurus   | 7     |

  Scenario: Pieces and slots are plain
    When I tap Tyrannosaurus
    Then no spot in the tray and no slot on the outline is tinted by body area
    And an empty slot shows only the faint outline under it

  Scenario: A piece fits as near its home as at Hatchling
    Given I am building Triceratops
    When I drop its frill 40 CSS pixels from its home
    Then the frill fits there
    When I drop its tail beside the board
    Then the tail floats back to its spot, nothing lost

  Scenario: Finishing Explorer's puzzle earns the star
    Given I am building Stegosaurus with six pieces fitted
    When I fit the last piece
    Then the counter shows "7/7"
    And the reveal shows, earning the Stegosaurus star once, as at Hatchling
