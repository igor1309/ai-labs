Feature: Skeleton assembly: the mystery skeleton
  Once a skeleton has its star, the choice of dinosaurs offers a mystery:
  one of the skeletons already built, its name and picture hidden, to
  build and then guess by its bones (docs/game-design.md, LAB-284). It
  turns building into finding out. A wrong guess gives a clue, never a
  dead end, and the mystery earns no star of its own.

  Background:
    Given an iPad in landscape

  Scenario: The mystery waits for a first star
    Given no skeleton has its star
    When I open the skeleton game
    Then the choice of dinosaurs shows no mystery

  Scenario: A star brings the mystery tile
    Given Tyrannosaurus and Triceratops have their stars
    When I open the skeleton game
    Then the choice of dinosaurs ends with a "?" tile, its picture hidden

  Scenario: The mystery is a skeleton already built, its name hidden
    Given Tyrannosaurus and Triceratops have their stars
    And the level switch shows Explorer chosen
    When I tap the "?" tile
    Then I build Tyrannosaurus or Triceratops, cut for Explorer
    And the bar shows "?" in place of its name
    And help, sounds and moves are as for any skeleton

  Scenario: The finished mystery asks whose skeleton it is
    Given I am building the mystery Triceratops
    When I fit the last bone
    Then the skeleton stomps and roars as any skeleton does
    And then it asks "WHOSE SKELETON IS IT?" with three dinosaurs' bodies, unnamed

  Scenario Outline: The three dinosaurs to guess from
    Given the level switch shows <level> chosen
    And I have finished the mystery <dinosaur>
    Then the three dinosaurs are <dinosaur>, <others>, in any order

    Examples:
      | level          | dinosaur      | others                                                        |
      | Explorer       | Triceratops   | one of its look-alikes and one dinosaur unlike it               |
      | Paleontologist | Tyrannosaurus | one of its look-alikes and one dinosaur unlike it               |
      | Explorer       | Spinosaurus   | two dinosaurs unlike it, as no dinosaur looks like Spinosaurus  |
      | Hatchling      | Triceratops   | two dinosaurs unlike it, so the youngest guess by the body      |

  Scenario: A wrong guess gives a clue
    Given the mystery Triceratops asks whose skeleton it is
    When I tap a dinosaur that is not Triceratops
    Then I hear the springy "boing" and that dinosaur wobbles
    And it rests aside, and cannot be tapped again
    And the line says "LOOK AT ITS THREE HORNS!"
    And I can guess again from the others

  Scenario: The right guess reveals the dinosaur
    Given the mystery Triceratops asks whose skeleton it is
    When I tap Triceratops
    Then the dinosaur is revealed with its name and fact, as any finished skeleton
    And no new star is earned, as Triceratops already has its star

  Scenario: Leaving the guess loses nothing
    Given the mystery Triceratops asks whose skeleton it is
    When I tap BACK
    Then the choice of dinosaurs shows again, with every star as before
