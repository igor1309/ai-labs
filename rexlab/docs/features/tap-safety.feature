@next
Feature: Every tap is safe to repeat
  A child of 5–7 often taps twice, or keeps tapping while a screen
  changes. A quick double tap does what one tap does: it opens one
  screen, starts one thing, and presses nothing on the screen that
  appears next. docs/tap-safety.md states the rule; the games' own
  features keep their particular double-tap scenarios.

  Background:
    Given an iPad in landscape

  Scenario Outline: A double tap opens one screen and presses nothing on it
    Given I am on <from>
    When I tap <control> twice quickly
    Then I see <to>, opened once
    And no start is counted twice
    And the second tap pressed nothing on <to>

    Examples:
      | from                       | control                 | to                                      |
      | the home page              | "COMPARE"               | the first question                      |
      | the home page              | "ALL DINOSAURS"         | the list of dinosaurs                   |
      | the home page              | "CARE"                  | dinosaur care's welcome                 |
      | the home page              | "SORT"                  | a sorting board                         |
      | the home page              | "FIND THE PAIR"         | find the pair's welcome                 |
      | the home page              | "SKELETONS"             | the skeleton game's choice of dinosaurs |
      | the home page              | "MUSEUM"                | the museum hall                         |
      | the home page              | the large card          | the featured game                       |
      | the quiz's result          | "PLAY AGAIN"            | the first question                      |
      | the quiz's result          | "HOME"                  | the home page                           |
      | a question                 | "HOME"                  | the home page                           |
      | the list of dinosaurs      | "HOME"                  | the home page                           |
      | a dinosaur's page          | "ALL DINOSAURS"         | the list of dinosaurs                   |
      | dinosaur care's welcome    | "NEW VISITOR"           | a care visit                            |
      | dinosaur care's result     | "HOME"                  | the home page                           |
      | the sorting game's result  | "PLAY AGAIN"            | a sorting board                         |
      | find the pair's welcome    | "PLAY"                  | a pairs board                           |
      | find the pair's result     | "HOME"                  | the home page                           |
      | the skeleton game's choice | the card of Triceratops | the Triceratops board                   |
      | the skeleton game's reveal | "BUILD ANOTHER"         | the skeleton game's choice of dinosaurs |
      | the museum hall            | "HOME"                  | the home page                           |

  Scenario: Taps wait until the new screen has appeared
    Given the device does not ask for reduced motion
    When I tap "MUSEUM" on the home page
    And I tap where a museum button stands while the museum is still appearing
    Then that tap presses nothing
    When the museum has appeared
    Then a tap on its buttons works

  Scenario: A screen waiting for its pictures takes no second request
    Given the pictures of the first question are still loading
    When I tap "COMPARE" and then "COMPARE" again
    Then one round starts once the pictures are ready

  Scenario: A tap left behind is dropped
    Given the pictures of a sorting board are still loading after I tapped "SORT"
    When I tap "ALL DINOSAURS"
    Then I see the list of dinosaurs
    And the sorting board never opens over it, nor counts a start

  Scenario Outline: An action started takes no second trigger
    Given I am on <screen>
    When I <act> twice quickly
    Then it happens once

    Examples:
      | screen               | act                   |
      | a question           | tap the left dinosaur |
      | a question, answered | tap "NEXT"            |
      | a pairs board        | tap a face-down card  |
      | a care visit         | tap water             |
      | a dinosaur's page    | tap the → button      |
