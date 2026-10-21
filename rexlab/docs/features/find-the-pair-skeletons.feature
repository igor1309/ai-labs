Feature: Find the pair: Paleontologist's skeletons
  Paleontologist's board pairs each dinosaur's picture with its whole
  skeleton, the bones the skeleton game's outlines are traced from
  (LAB-301). A skeleton is drawn of one dinosaur of every look-alike
  group, so the board deals those dinosaurs, one of each group, as a
  board of silhouettes does. Hatchling and Explorer keep their
  silhouettes.

  Background:
    Given an iPad in landscape
    And the level switch shows Paleontologist chosen

  Scenario: Each pair matches a picture to its skeleton
    When I tap "PLAY"
    Then I see 12 pairs of face-down cards in 4 rows of 6
    And each pair is a dinosaur's picture and its whole skeleton
    And no two of its dinosaurs are from the same look-alike group

  Scenario: Only a dinosaur with a whole skeleton is dealt
    When I tap "PLAY"
    Then every dinosaur dealt has a whole skeleton
    And a dinosaur without one is never dealt at Paleontologist

  Scenario: Every look-alike group has a skeleton to deal
    Then a whole skeleton is drawn of a dinosaur of every look-alike group
    And there are more look-alike groups than the board's 12 pairs

  Scenario: A turned skeleton shows its bones
    When I turn over a skeleton card
    Then it shows the dinosaur's skeleton in its own bone colour, not in ink
    When I find its pair
    Then both cards show the dinosaur's name, as any found pair does

  Scenario Outline: A skeleton stands out from its card
    Given the language is <language> and the theme is <theme>
    When I turn over a skeleton card
    Then the skeleton's bones stand apart from the card behind them

    Examples:
      | language | theme |
      | English  | light |
      | English  | dark  |
      | Russian  | light |
      | Russian  | dark  |

  Scenario: Explorer keeps its silhouettes
    Given the level switch shows Explorer chosen
    When I tap "PLAY"
    Then each pair matches a picture to its silhouette, with no skeleton
