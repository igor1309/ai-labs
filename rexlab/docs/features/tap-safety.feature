Feature: Every tap is safe to repeat
  A child of 5–7 often taps twice, or keeps tapping while a screen
  changes. A quick double tap does what one tap does: it opens one
  screen, starts one thing, and presses nothing on the screen that
  appears next. docs/tap-safety.md states the rule. The rows below are
  examples of each kind of control; the double-tap test's registry
  (LAB-299) lists every one. A second trigger of an action inside a
  screen (an answer, a card turned, water given) is specified in each
  game's own feature.

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

  @next
  Scenario Outline: Taps wait until the new screen has appeared
    Given the device <motion>
    And I am on the home page
    When I tap "MUSEUM"
    And while the museum is still appearing I tap where a museum button stands
    And while it is still appearing I tap where "SORT" stood on the home page
    Then neither tap presses anything
    When the museum has appeared
    Then a tap on its buttons works

    Examples:
      | motion                          |
      | does not ask for reduced motion |
      | asks for reduced motion         |

  @next
  Scenario: A drag waits until the new screen has appeared
    Given I am on the home page
    When I tap "SORT"
    And while the sorting board is still appearing I start dragging a card
    Then the card does not move
    When the board has appeared
    Then I can drag a card to a basket

  @next
  Scenario: Another screen chosen during a wait for pictures replaces it
    Given I am on the home page
    And pictures load slowly
    When I tap "SORT"
    And I tap "ALL DINOSAURS" before the sorting board's pictures load
    Then I see the dinosaur list
    And the sorting board never opens over it, nor counts a start

  @next
  Scenario: A second tap on a game's start deals no second round
    Given I am on the home page
    And pictures load slowly
    When I tap "SORT" twice quickly, before the pictures load
    Then one sorting board is dealt and loads
    And it opens once its pictures have loaded
