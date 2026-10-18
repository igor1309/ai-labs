@next
Feature: Every tap is safe to repeat
  A child of 5–7 often taps twice, or keeps tapping while a screen
  changes. A quick double tap does what one tap does: it opens one
  screen, starts one thing, and presses nothing on the screen that
  appears next. docs/tap-safety.md states the rule. The rows below are
  examples of each kind of control; the double-tap test's registry
  (LAB-299) lists every one.

  Background:
    Given an iPad in landscape

  Scenario Outline: A double tap opens one screen and presses nothing on it
    Given I am on <from>
    When I tap <control> twice quickly
    Then I see <to>, opened once
    And <starts> counted
    And the second tap pressed nothing on <to>

    Examples:
      | from                               | control                 | to                               | starts                        |
      | the home page                      | "COMPARE"               | the first question               | one start of COMPARE is       |
      | the home page                      | "ALL DINOSAURS"         | the dinosaur list                | one start of ALL DINOSAURS is |
      | the home page                      | "CARE"                  | the care welcome screen          | no start is                   |
      | the home page                      | "SORT"                  | a sorting board                  | one start of SORT is          |
      | the home page                      | "FIND THE PAIR"         | the find-the-pair welcome screen | no start is                   |
      | the home page                      | "SKELETONS"             | the skeleton selection screen    | no start is                   |
      | the home page                      | "MUSEUM"                | the museum hall                  | no start is                   |
      | the home page, featuring SORT      | the large card          | a sorting board                  | one start of SORT is          |
      | a question, answered               | "NEXT"                  | the next question                | no start is                   |
      | the last question, answered        | "SEE RESULT"            | the quiz's result screen         | no start is                   |
      | the quiz's result screen           | "PLAY AGAIN"            | the first question               | one start of COMPARE is       |
      | the quiz's result screen           | "HOME"                  | the home page                    | no start is                   |
      | a question                         | "HOME"                  | the home page                    | no start is                   |
      | the dinosaur list                  | the card of Triceratops | the page of Triceratops          | no start is                   |
      | the page of Triceratops            | "ALL DINOSAURS"         | the dinosaur list                | no start is                   |
      | the dinosaur list                  | "HOME"                  | the home page                    | no start is                   |
      | the care welcome screen            | "NEW VISITOR"           | a care visit                     | one start of CARE is          |
      | the care result screen             | "NEW VISITOR"           | a care visit                     | one start of CARE is          |
      | the care friends screen            | "BACK"                  | the care welcome screen         | no start is                   |
      | a care visit                       | "HOME"                  | the home page                    | no start is                   |
      | a sorting board, all sorted        | "SEE RESULT"            | the sorting game's result screen | no start is                   |
      | the sorting game's result screen   | "PLAY AGAIN"            | a sorting board                  | one start of SORT is          |
      | a sorting board                    | "HOME"                  | the home page                    | no start is                   |
      | the find-the-pair welcome screen   | "PLAY"                  | a pairs board                    | one start of FIND THE PAIR is |
      | the find-the-pair result screen    | "PLAY AGAIN"            | a pairs board                    | one start of FIND THE PAIR is |
      | a pairs board                      | "HOME"                  | the home page                    | no start is                   |
      | the skeleton selection screen      | the card of Triceratops | the Triceratops skeleton board   | one start of SKELETONS is     |
      | the skeleton game's reveal         | "BUILD ANOTHER"         | the skeleton selection screen    | no start is                   |
      | the museum hall, Triceratops built | "REBUILD"               | the Triceratops skeleton board   | one start of SKELETONS is     |
      | the museum hall                    | "HOME"                  | the home page                    | no start is                   |

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

  Scenario: Another screen chosen during a wait for pictures replaces it
    Given I am on the home page
    And the pictures of the next sorting board are still loading
    When I tap "SORT"
    And I tap "ALL DINOSAURS" before they load
    Then I see the dinosaur list
    And the sorting board never opens over it, nor counts a start

  Scenario Outline: An action started takes no second trigger
    Given I am on <screen>
    When I <act> twice quickly
    Then <outcome>

    Examples:
      | screen                  | act                   | outcome                                                           |
      | a question              | tap the left dinosaur | the question is answered once, and the score changes at most once |
      | a pairs board           | tap a face-down card  | that one card turns face up, and no other card turns              |
      | a care visit            | tap water             | the dinosaur drinks once, and its hearts change once              |
      | the page of Triceratops | tap the → button      | the next dinosaur's page shows, one step on                       |
