Feature: Skeleton assembly: Explorer
  Explorer builds each skeleton from its own cut of six to eight pieces
  on the full outline (skeleton-assembly-levels.feature,
  docs/skeleton-levels.md). Each piece belongs to one body area: head,
  neck, back, hips, legs or tail. A piece in the tray and its empty slot
  on the outline carry that area's colour, so a child can match a bone to
  where it goes. The colours are a cue, not a key: there is no legend to
  learn, and a piece fits by its place alone. Pieces stay the right way
  up and fit as near their homes as Hatchling's do. Hatchling keeps its
  four plain pieces, and Paleontologist's own cut is plain too.

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

  Scenario: Each piece and its slot share its body area's colour
    When I tap Tyrannosaurus
    Then each piece's spot in the tray is tinted with its body area's colour
    And each empty slot on the outline shows its bone's shape in the same area's colour
    And the left and right legs, both of the legs, share one colour
    And pieces of different body areas never share a colour

  Scenario: A fitted piece shows as itself
    Given I am building Tyrannosaurus
    When I fit its skull
    Then the skull's slot shows the skull's own picture, its colour gone
    And the skull's spot in the tray is empty and plain
    And every other piece and slot keeps its colour

  Scenario Outline: The colours hold in either theme
    Given the app uses the <theme> theme
    When I tap Stegosaurus
    Then each body area's colour and tint are the <theme> theme's own
    And each spot's ring in its area's colour has at least 3:1 contrast with the tray
    And each bone shows on its tinted spot at least 3:1, by its dark outline in light and its pale bone in dark

    Examples:
      | theme |
      | light |
      | dark  |

  Scenario: A piece fits as near its home as at Hatchling
    Given I am building Triceratops
    When I drop its frill 40 CSS pixels from its home
    Then the frill fits there
    When I drop its tail beside the board
    Then the tail floats back to its tinted spot, nothing lost

  Scenario: Colour is only a cue
    Given I am building Triceratops
    When I drop its front legs on the hind legs' slot, the same colour
    Then the front legs float back to the tray, and the hind legs' slot stays empty

  Scenario Outline: Only Explorer is coloured
    Given the level switch shows <level> chosen
    When I tap Triceratops
    Then its <count> pieces and their slots are plain

    Examples:
      | level          | count |
      | Hatchling      | 4     |
      | Paleontologist | 10    |

  Scenario: Finishing Explorer's puzzle earns the star
    Given I am building Stegosaurus with six pieces fitted
    When I fit the last piece
    Then the counter shows "7/7"
    And the reveal shows, earning the Stegosaurus star once, as at Hatchling
