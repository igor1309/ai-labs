Feature: COMPARE's dig-site fit and scrolling
  The screen fits its target windows without hiding content. Only windows
  too small for the minimum picture and controls use whole-page scrolling.

  Scenario Outline: A target window has a predictable scroll result
    Given a window of <width> by <height> CSS pixels with no safe-area insets
    And the language is English or Russian
    When I see an answered question with both values and NEXT
    Then the whole question <scrolls>
    And every picture, name, value and action is reachable without horizontal scrolling
    When I see a result with ten won stars, a new best and all level choices
    Then the whole result <scrolls>
    And every reward and action is reachable without horizontal scrolling

    Examples:
      | width | height | scrolls         |
      | 1180  | 820    | does not scroll |
      | 1133  | 744    | does not scroll |
      | 744   | 1133   | does not scroll |
      | 393   | 852    | does not scroll |
      | 852   | 393    | does not scroll |
      | 1440  | 900    | does not scroll |
      | 375   | 667    | scrolls         |
      | 320   | 568    | scrolls         |

  Scenario: A very short landscape window scrolls at the minimum sizes
    Given a window of 568 by 200 CSS pixels
    When I see an answered question
    Then the whole question scrolls vertically
    And each picture remains at least 110 CSS pixels high
    And NEXT remains reachable
    When I see the result
    Then the whole result scrolls vertically
    And its dinosaur remains at least 120 CSS pixels high
    And the level choices, PLAY AGAIN and HOME remain reachable
