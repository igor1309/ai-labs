Feature: COMPARE in the dig site
  A round keeps its questions, answers, score, saved progress and level choices
  while its presentation uses the dig site's sky, sand, pockets and rewards.
  Light and dark appearance use the same game state and interactions.

  Scenario Outline: A question takes the window's shape
    Given the app is in <language> with the <theme> appearance
    And a window of <width> by <height> CSS pixels
    When I start COMPARE
    Then HOME, ten progress steps and the question sit in the sky
    And the cards are dug into the sand with a dark name label under each picture
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

  Scenario: A small window scrolls as one screen
    Given the question's pictures would be smaller than 110 pixels on a phone or 150 pixels on an upright iPad
    When I see the question
    Then the whole screen scrolls vertically to keep the pictures at their minimum
    And NEXT follows the cards in the scroll
    And there is no nested board scroll

  Scenario: The bar shows the current level's saved best
    Given the level being played has a saved best of 7
    When I see a question on an iPad or desktop
    Then the sky shows a trophy and 7
    And on a narrow phone the best is kept for the result
    And an unavailable best is not invented as 0

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
    When a question opens before its pictures are loaded
    Then its prompt, progress and names show at once
    And each picture shimmers until loaded
    And no values or NEXT show before an answer

  Scenario Outline: A result separates sky and rewards
    Given a finished round with <celebration>
    When its result is shown
    Then the dinosaur stands in the sky and the rewards stand in the sand
    And the score, ten stars, WELL DONE and best appear with their appropriate symbols
    And only the earned celebration is shown
    And the chosen level, PLAY AGAIN and HOME remain available
    And short landscape puts the dinosaur beside the rewards
    And narrow portrait puts PLAY AGAIN above HOME and keeps level names accessible with their pictures
    And a window that cannot keep a 120-pixel dinosaur scrolls as one screen

    Examples:
      | celebration                   |
      | a first best                  |
      | a new best over an older best |
      | no new best                   |
      | an unavailable saved best     |
      | a first round scoring zero    |

  Scenario: Choosing a level leaves the finished round's reward intact
    Given an Explorer result showing 7 out of 10
    When I choose Hatchling
    Then the score and Explorer best remain unchanged
    And no round starts until PLAY AGAIN
    And PLAY AGAIN starts Hatchling

  Scenario: Turning and reduced motion preserve the round
    Given an answered question or a completed result
    When the window changes shape or appearance
    Then the current question, marks, values, score and chosen level remain
    And layout changes animate with the shared motion timings
    And a completed celebration does not replay on a window turn
    And reduced motion uses short fades

  Scenario: Game behaviour and theme have separate checks
    Then behaviour tests prove state, actions, scoring and persistence using deterministic collaborators
    And presentation tests render controlled states in both appearances and every affected size class
    And browser tests prove actual fit, scrolling and controls in English and Russian for all three age levels
    And a full-flow test proves answering, the result, choosing a level, replay and HOME without repeating whole games for cosmetic variants
