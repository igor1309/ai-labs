Feature: The compare quiz's result on an iPhone on its side

  In a landscape window under 600 tall, an iPhone on its side, the
  compare quiz's result keeps its dinosaur beside the rewards, the level
  switch and the actions, all within the height. The sorting game's
  result, the same screen, stands the same way.

  Scenario Outline: The dinosaur stands beside the rewards
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When a round ends with every answer right and a new best
    Then the dinosaur stands whole beside the rewards, as tall as the height allows
    And the celebration stands over the score, which stands beside WELL DONE! over the stars
    And the best score, the level switch, and PLAY AGAIN beside HOME stand under them, within the height
    And the switch shows each level's picture alone, its name kept for screen readers
    And the result keeps 20 pixels past the notch on each side and clears the home indicator
    And every tap is at least 44 pixels

    Examples:
      | language | width | height |
      | English  | 667   | 375    |
      | English  | 852   | 393    |
      | English  | 932   | 430    |
      | Russian  | 667   | 375    |
      | Russian  | 852   | 393    |
      | Russian  | 932   | 430    |

  Scenario: Every word fits at every phone's width
    Given the result on an iPhone on its side, from 568 to 932 pixels wide
    Then ten stars fit beside the score, and WELL DONE! beside it in either language
    And PLAY AGAIN and HOME fit side by side, and every celebration on its chip

  Scenario: A taller window goes back to the iPad's layout
    Given the result on an iPhone on its side
    When the window grows past 600 tall
    Then the result takes the iPad's layout
