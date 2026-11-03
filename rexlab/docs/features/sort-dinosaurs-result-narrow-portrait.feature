Feature: Sort dinosaurs: the result in a tall-narrow window
  On a phone upright sort's result shows upright, with no ask to turn
  sideways, and as the compare quiz's result does on a phone. The level
  switch may show its pictures without their words, so long as each
  level keeps its name for screen readers. Where the parts sit and their
  sizes are the design's call, not this spec's.

  Scenario Outline: The result shows upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I finish a <level> board
    Then I see no picture asking to turn sideways or to make the window wider
    And I see the cheering dinosaur, the score, every star, the praise, the best score, the level switch, "PLAY AGAIN" and "HOME", none cut
    And each level, "PLAY AGAIN" and "HOME" is at least 44 by 44 CSS pixels to tap

    Examples:
      | width | height | level          | language |
      | 320   | 568    | Hatchling      | English  |
      | 320   | 568    | Paleontologist | Russian  |
      | 393   | 852    | Explorer       | English  |
      | 430   | 932    | Paleontologist | Russian  |

  Scenario: The result stays as the window narrows to a phone's
    Given sort's result upright in a tall window
    When the window narrows to 393 by 852
    Then the result stays, with no picture asking to turn, and PLAY AGAIN still starts a new board
