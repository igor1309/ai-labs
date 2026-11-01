Feature: Skeleton assembly: the skeleton comes alive
  The skeleton game answers every touch at once, with a sound and a
  movement tied to what the child did (docs/game-design.md, LAB-389):
  a bone picked up, a bone that fits, a drop that misses, and the
  finished skeleton. It is fun with the rules ignored, and a miss is
  funny, never silent. The same at every level. Sounds are made on the
  iPad, not recorded; where it cannot make them the game is silent and
  plays the same.

  Background:
    Given an iPad in landscape
    And I am building Tyrannosaurus at any level

  Scenario: A bone picked up answers the touch
    When I press a bone in the tray
    Then I hear a short pick-up sound as it lifts

  Scenario Outline: A bone that fits clicks home and moves as itself
    When I fit its <bone>
    Then I hear <sound>
    And the fitted <bone> <moves>

    Examples:
      | bone  | sound          | moves                                 |
      | skull | a jaw snapping | snaps its jaw shut twice as it settles |
      | tail  | a click        | swishes once as it settles            |
      | hips  | a click        | settles into place                    |

  Scenario: A drop that misses wobbles back with a sound
    When I drop a bone beside the board
    Then I hear a springy "boing"
    And the bone wobbles as it floats back to the tray, nothing lost

  Scenario: Another dinosaur's bone misses the same way
    Given the level switch shows Paleontologist chosen
    And I am building Triceratops
    When I drop the Tyrannosaurus skull on the outline
    Then I hear the springy "boing" and the bone wobbles back
    And the line says whose bone it is, as before

  Scenario: The finished skeleton stomps and roars before its body shows
    Given I am building Tyrannosaurus with all but one bone fitted
    When I fit the last bone
    Then the whole skeleton stomps twice and its skull snaps as I hear a roar
    And only then the dinosaur's body fades in over it, with its name and fact

  Scenario: Reduced motion keeps the sounds and stills the movement
    Given the iPad asks for reduced motion
    When I fit the skull, drop a bone beside the board, and fit the last bone
    Then I hear each sound as without reduced motion
    And nothing snaps, wobbles or stomps
    And the body fades in as soon as the last bone has settled

  Scenario: An iPad that cannot make sounds still plays
    Given the browser cannot make sounds
    When I build Tyrannosaurus
    Then every bone moves and the skeleton stomps as with sound
    And nothing waits for a sound
