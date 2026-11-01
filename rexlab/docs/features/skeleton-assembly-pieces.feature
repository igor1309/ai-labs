Feature: Skeleton assembly: placing bones
  Each bone piece has exactly one matching slot. A generous snap area
  accepts an imprecise drop; any other drop invites another try.
  Each dinosaur's pieces are slices of one full skeleton illustration
  in the shared art/style.md style, so they fit together without gaps.
  The MVP combines neck and ribs in the spine piece and all legs in one
  legs piece; later levels may split them.

  Background:
    Given an iPad in landscape
    And the level switch shows Hatchling chosen, whose four pieces these scenarios count
    And a skeleton puzzle is in progress

  Scenario: A child can pick up and drag a large bone piece
    Given all four pieces are in the tray
    Then every piece has a touch target of at least 48 by 48 CSS pixels
    When I press a bone piece and move my finger
    Then that piece follows my finger without rotating
    And the other pieces stay where they are
    And dragging the piece does not scroll the page

  Scenario Outline: Each MVP dinosaur has one home slot per anatomy piece
    Given I am building <dinosaur>
    Then its tray contains exactly these four pieces and home slots
      | piece | anatomy | home slot |
      | skull | skull   | skull     |
      | spine | spine, neck and ribs | spine     |
      | legs  | front and rear legs  | legs      |
      | tail  | tail    | tail      |
    And each piece accepts a drop within a snap radius of at least 24 CSS pixels around its home slot
    And no piece accepts any other slot

    Examples:
      | dinosaur      |
      | Tyrannosaurus |
      | Triceratops   |
      | Stegosaurus   |
      | Brachiosaurus |
      | Spinosaurus   |

  Scenario: A near miss snaps into the correct slot
    Given all four pieces are unplaced
    When I drag the skull and drop it slightly outside its visible slot but inside its snap radius
    Then the skull animates into exact alignment with its slot
    And it stays on the outline and is no longer available in the tray
    And three pieces remain to place

  Scenario: A piece cannot snap into a different bone's slot
    Given the skull is unplaced
    When I drop it inside the legs' snap area but outside the skull's snap area
    Then the skull floats back to its place in the tray
    And no slot is filled
    And I see no cross, failure message or lost reward
    And I can try the skull again

  Scenario: A drop away from every slot returns gently to the tray
    Given I have placed two pieces
    When I drop an unplaced piece outside its matching snap area
    Then it floats back to the tray
    And the two placed pieces stay fitted
    And I lose no progress or earned star

  Scenario: Pieces can be placed in any order
    Given all four pieces are in the tray
    When I place the tail before the skull and then fit the remaining pieces
    Then every piece fits only its matching slot
    And the skeleton is complete

  Scenario: Placed pieces cannot be pulled out during assembly
    Given I have fitted the skull
    When I try to drag the fitted skull
    Then it stays fitted
    And only unplaced pieces can be picked up

  Scenario: A second finger cannot duplicate or move another piece
    Given I am dragging the skull with one finger
    When another finger touches a tray piece or releases over the outline
    Then only the skull remains under my control
    And no second piece is placed or removed
    When I release the first finger over the skull's matching snap area
    Then the skull is placed exactly once

  Scenario: An interrupted drag leaves a usable puzzle
    Given I have placed two pieces and am dragging a third
    When the touch is cancelled before I drop the third piece
    Then the third piece returns to the tray
    And the two placed pieces stay fitted
    And I can pick up the third piece again

  Scenario: Portrait pauses the puzzle and cancels a drag
    Given I have placed two pieces and am dragging a third
    When I turn the iPad to portrait
    Then I see the app's picture asking me to turn sideways
    And I cannot move pieces or trigger controls behind that picture
    When I turn the iPad back to landscape
    Then the same two pieces are fitted and the other two are in the tray
    And no completion or reward has been recorded
