Feature: Choosing a dinosaur picture puzzle
  The picture jigsaw is separate from building a skeleton.
  Its first pictures are Tyrannosaurus, Triceratops and Stegosaurus.

  Scenario: Choosing a picture and a level
    Given I open PICTURE PUZZLE from its illustrated home tile
    Then I see the three named dinosaur pictures and my collection stars
    And a level switch starts at the global age level unless I chose a puzzle level under that setting
    When I choose another level
    Then that choice survives reloads until the global setting changes
    And it is stored with the game entry in rexlab-progress
    And unreadable storage keeps the choice for this session only
    And no puzzle starts until I choose a dinosaur
    When I choose a dinosaur
    Then I enter a fresh shuffled puzzle of that dinosaur at the chosen level

  Scenario Outline: Each level has its approved piece count
    Given I choose <level>
    When I choose a dinosaur
    Then its picture has <columns> columns and <rows> rows of upright pieces
    And the puzzle has exactly <pieces> pieces and matching slots

    Examples:
      | level          | columns | rows | pieces |
      | Hatchling      | 4       | 3    | 12     |
      | Explorer       | 6       | 4    | 24     |
      | Paleontologist | 6       | 6    | 36     |

  Scenario: Leaving a puzzle does not award it
    Given I have placed some pieces
    When I return to picture choice or home
    Then no star or completion is awarded
    And choosing a dinosaur again starts a fresh puzzle
