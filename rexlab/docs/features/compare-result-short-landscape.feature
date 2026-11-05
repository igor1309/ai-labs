Feature: The compare quiz's result in a short landscape window

  In a wide-short window, landscape under 600 tall and at least 568 wide, the
  compare quiz's result keeps its dinosaur beside the rewards, the level
  switch and the actions. Everything fits the height when the minimum content
  fits; otherwise the whole page scrolls vertically. The dinosaur stays
  at least 120 CSS pixels high and the actions remain reachable.

  Scenario Outline: The dinosaur stands beside the rewards
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When a round ends with every answer right and a new best
    Then the dinosaur stands whole beside the rewards, as tall as the height allows
    And the celebration stands over the score, which stands beside WELL DONE! over the stars
    And the best score, the level switch, and PLAY AGAIN beside HOME stand under them, within the height when the minimum content fits
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

  Scenario: Every word fits across short landscape widths
    Given the result in a wide-short window, from 568 to 932 pixels wide
    Then ten stars fit beside the score, and WELL DONE! beside it in either language
    And PLAY AGAIN and HOME fit side by side, and every celebration on its chip

  Scenario Outline: Resizing selects the new window class
    Given a compare result in a wide-short window
    When the window becomes <width> by <height> CSS pixels
    Then its class is <class> and the dinosaur is <placement>

    Examples:
      | width | height | class       | placement         |
      | 852   | 600    | wide        | above the rewards |
      | 568   | 600    | tall-narrow | above the rewards |
      | 600   | 600    | tall        | above the rewards |
