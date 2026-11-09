Feature: COMPARE in the dig site
  A round keeps its questions, answers, score, saved progress and level choices
  while its presentation uses the dig site's sky, sand, pockets and rewards.
  Light and dark appearance use the same game state and interactions.
  Layout follows the window, independently of the device's identity:
    | class       | window                                                   |
    | wide        | landscape, at least 600 CSS pixels tall                   |
    | wide-short  | landscape, under 600 tall and at least 568 wide            |
    | tall        | portrait including square, at least 600 CSS pixels wide   |
    | tall-narrow | portrait under 600 wide, or landscape under 568 wide       |

  Scenario Outline: A question takes the window's shape
    Given the app is in <language> with the <theme> appearance
    And a window of <width> by <height> CSS pixels
    When I start COMPARE
    Then HOME, ten progress steps, the current position and the question sit in the sky
    And the cards are dug into the sand with names beneath their pictures inside the pockets
    And names, pockets and their rings use the current appearance's design tokens
    And the cards are <cards> with VS between them, or ИЛИ in Russian
    And prompts, names and values fit without clipping or horizontal scrolling
    And safe areas keep every control clear of the notch and home indicator

    Examples:
      | language | theme | width | height | cards        |
      | English  | light | 1180  | 820    | side by side |
      | Russian  | dark  | 1133  | 744    | side by side |
      | English  | dark  | 744   | 1133   | stacked      |
      | Russian  | light | 393   | 852    | stacked      |
      | English  | light | 375   | 667    | stacked      |
      | Russian  | dark  | 852   | 393    | side by side |
      | English  | dark  | 1440  | 900    | side by side |
      | English  | light | 567   | 360    | stacked      |
      | English  | light | 568   | 360    | side by side |
      | English  | light | 700   | 700    | stacked      |
      | Russian  | dark  | 500   | 500    | stacked      |

  Scenario Outline: A question keeps its picture minimum
    Given a <class> window whose content cannot fit at the minimum picture height
    When I see the question
    Then each picture stays at least <minimum> CSS pixels high
    And the whole screen, sky included, scrolls vertically
    And NEXT follows the cards in the scroll
    And there is no nested board scroll

    Examples:
      | class       | minimum |
      | tall        | 150     |
      | tall-narrow | 110     |
      | wide        | 150     |
      | wide-short  | 110     |

  Scenario Outline: The bar shows an available current-level best on larger layouts
    Given the current level has a saved best of <best>
    And the window is <class>
    When I see a question
    Then <shown>

    Examples:
      | best        | class       | shown                                    |
      | 7           | wide        | a trophy and 7 / 10 appear in the sky          |
      | 7           | tall        | a trophy and 7 / 10 appear in the sky          |
      | 7           | tall-narrow | no best-score trophy or number is shown   |
      | 7           | wide-short  | no best-score trophy or number is shown   |
      | unavailable | wide        | no best-score trophy or number is shown   |
      | 0           | wide        | a trophy and 0 / 10 appear in the sky          |

  Scenario: An answer marks its pocket and its progress step
    Given an unanswered question
    When I choose a dinosaur
    Then its pocket receives a correct or wrong symbol and ring
    And a wrong choice also marks the correct dinosaur
    And both values appear at the bottom right of their pictures
    And that question's step shows whether the answer was correct
    And the cards keep their size and place
    And NEXT appears, or SEE RESULT on question ten
    And further taps cannot change the answer

  Scenario: Pictures can still be loading when a question opens
    Given the next question's pictures have not loaded
    When that question opens
    Then its prompt, progress and names show at once
    And each picture shimmers until loaded
    And no values or NEXT show before an answer

