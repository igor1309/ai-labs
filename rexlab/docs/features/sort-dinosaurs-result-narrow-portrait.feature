Feature: Sort dinosaurs: the result in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), sort's result is the compare quiz's result screen and
  stands as it does on a phone (compare-dinosaurs-result-narrow-portrait.feature):
  20-pixel padding, the level switch as its pictures alone, and "PLAY
  AGAIN" over "HOME".

  Scenario Outline: The result stands upright on a phone
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When I finish a <level> board
    Then I see no picture asking to turn sideways or to make the window wider
    And the result takes the compare result's phone sizes for the width

    Examples:
      | width | height | level          | language |
      | 320   | 568    | Hatchling      | English  |
      | 320   | 568    | Paleontologist | Russian  |
      | 393   | 852    | Explorer       | English  |
      | 430   | 932    | Paleontologist | Russian  |

  Scenario: The result takes the phone's sizes as the window narrows
    Given sort's result upright in a tall window
    When the window narrows to 393 by 852
    Then the result stays, in the phone's sizes, with no picture asking to turn
