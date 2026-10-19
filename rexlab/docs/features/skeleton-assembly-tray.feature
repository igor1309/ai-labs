Feature: Skeleton assembly: the tray and a held bone
  What the tray and a held bone give away at each level
  (skeleton-assembly-levels.feature, docs/skeleton-levels.md). Hatchling
  lists its four bones head to tail and outlines a held bone's home, as
  the youngest need. Explorer and Paleontologist shuffle the tray for
  each puzzle and outline nothing, so the child finds each bone's place
  by its shape and, at Explorer, its colour. A long press or quick taps
  never take the touch from the piece.

  Background:
    Given an iPad in landscape

  Scenario Outline: Only Hatchling shows a held bone's home
    Given the level switch shows <level> chosen
    And I am building Tyrannosaurus
    When I hold a bone over the outline
    Then <home>

    Examples:
      | level          | home                                   |
      | Hatchling      | its home slot is outlined faintly      |
      | Explorer       | nothing on the outline shows its home  |
      | Paleontologist | nothing on the outline shows its home  |

  Scenario Outline: The tray's order
    Given the level switch shows <level> chosen
    When I tap Tyrannosaurus
    Then the tray lists its bones <order>, in two columns once it holds five or more

    Examples:
      | level          | order                                  |
      | Hatchling      | head to tail                           |
      | Explorer       | in an order shuffled for each puzzle   |
      | Paleontologist | in an order shuffled for each puzzle   |

  Scenario: A long press or quick taps keep the piece
    Given I am building Tyrannosaurus at any level
    When I hold a bone piece still, or tap it several times quickly
    Then no menu opens to share or save its picture, and nothing is selected
    And the piece can still be dragged or turned
