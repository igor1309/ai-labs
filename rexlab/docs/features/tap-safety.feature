Feature: Every tap is safe to repeat
  A child of 5–7 often taps twice, or keeps tapping while a screen
  changes. A quick double tap does what one tap does: it opens one
  screen, starts one thing, and presses nothing on the screen that
  appears next. docs/tap-safety.md states the rule. The rows below are
  examples of each kind of control; the double-tap test's registry
  (LAB-299) lists every one. A second trigger of an action inside a
  screen (an answer, a card turned, water given) is specified in each
  game's own feature; tap-safety-settle.feature tells how a new screen
  settles and how a waiting change is replaced.

  Background:
    Given an iPad in landscape

  @next
  Scenario Outline: A double tap opens one screen and presses nothing on it
    Given I am on <from>
    When I tap <control> twice quickly
    Then I see <to>, opened once
    And <starts> counted
    And the second tap pressed nothing on <to>

    Examples:
      | from                                    | control                 | to                                    | starts                        |
      | the home page                           | "COMPARE"               | the first question                    | one start of COMPARE is       |
      | the home page                           | "ALL DINOSAURS"         | the dinosaur list                     | one start of ALL DINOSAURS is |
      | the home page                           | "CARE"                  | the care welcome screen               | no start is                   |
      | the home page                           | "SORT"                  | a round of the sorting game           | one start of SORT is          |
      | the home page                           | "FIND THE PAIR"         | the find-the-pair welcome screen      | no start is                   |
      | the home page                           | "SKELETONS"             | the skeleton selection screen         | no start is                   |
      | the home page                           | "MUSEUM"                | the museum hall                       | no start is                   |
      | the home page, featuring SORT           | the large card          | a round of the sorting game           | one start of SORT is          |
      | a question, answered                    | "NEXT"                  | the next question                     | no start is                   |
      | the last question, answered             | "SEE RESULT"            | the result screen of the quiz         | no start is                   |
      | the result screen of the quiz           | "PLAY AGAIN"            | the first question                    | one start of COMPARE is       |
      | the result screen of the quiz           | "HOME"                  | the home page                         | no start is                   |
      | a question                              | "HOME"                  | the home page                         | no start is                   |
      | the dinosaur list                       | the card of Triceratops | the page of Triceratops               | no start is                   |
      | the page of Triceratops                 | "ALL DINOSAURS"         | the dinosaur list                     | no start is                   |
      | the page of Triceratops                 | the → button            | the next dinosaur's page              | no start is                   |
      | the dinosaur list                       | "HOME"                  | the home page                         | no start is                   |
      | the care welcome screen                 | "NEW VISITOR"           | a care visit                          | one start of CARE is          |
      | the care result screen                  | "NEW VISITOR"           | a care visit                          | one start of CARE is          |
      | the care friends screen                 | "BACK"                  | the care welcome screen               | no start is                   |
      | a care visit                            | "HOME"                  | the home page                         | no start is                   |
      | a round of the sorting game, all sorted | "SEE RESULT"            | the result screen of the sorting game | no start is                   |
      | the result screen of the sorting game   | "PLAY AGAIN"            | a round of the sorting game           | one start of SORT is          |
      | a round of the sorting game             | "HOME"                  | the home page                         | no start is                   |
      | the find-the-pair welcome screen        | "PLAY"                  | a pairs board                         | one start of FIND THE PAIR is |
      | the find-the-pair result screen         | "PLAY AGAIN"            | a pairs board                         | one start of FIND THE PAIR is |
      | a pairs board                           | "HOME"                  | the home page                         | no start is                   |
      | the skeleton selection screen           | the card of Triceratops | the Triceratops skeleton board        | one start of SKELETONS is     |
      | a skeleton result screen                | "BUILD ANOTHER"         | the skeleton selection screen         | no start is                   |
      | the museum hall, Triceratops built      | "REBUILD"               | the Triceratops skeleton board        | one start of SKELETONS is     |
      | the museum hall                         | "HOME"                  | the home page                         | no start is                   |
