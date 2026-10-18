Feature: Every tap is safe to repeat: settling and replacing
  A new screen takes no tap or drag until it has settled: its view
  transition has ended, or it is shown where the browser runs none, and
  500 ms have passed since it began to appear (docs/tap-safety.md, rules
  1 and 4). While a change waits for its pictures, the child's latest
  different request replaces it.

  Background:
    Given an iPad in landscape

  @next
  Scenario Outline: Taps wait until the new screen has settled
    Given <device>
    And I am on the home page
    When I tap "MUSEUM"
    And before 500 ms have passed since the museum began to appear, I tap where a museum button stands and where "SORT" stood
    Then neither tap presses anything, whether the museum is still appearing or has appeared
    When 500 ms have passed since the museum began to appear
    Then a tap on its buttons works

    Examples:
      | device                                     |
      | the device does not ask for reduced motion |
      | the device asks for reduced motion         |
      | the browser runs no view transitions       |

  @next
  Scenario Outline: A drag waits until the new screen has settled
    Given <device>
    And I am on <from>
    When I tap <control>
    And before 500 ms have passed since <board> began to appear, I start dragging <piece>
    Then it does not move
    When 500 ms have passed since <board> began to appear
    Then I can drag <piece> to its place

    Examples:
      | device                                     | from                               | control    | board               | piece  |
      | the device does not ask for reduced motion | the home page                      | "SORT"     | the sorting board   | a card |
      | the device asks for reduced motion         | the home page                      | "SORT"     | the sorting board   | a card |
      | the browser runs no view transitions       | the home page                      | "SORT"     | the sorting board   | a card |
      | the device does not ask for reduced motion | the museum hall, Triceratops built | "REBUILD"  | the skeleton board  | a bone |

  @next
  Scenario: NEXT tapped twice goes one question on, and NEXT works again later
    Given I am on question "3/10", answered
    When I tap "NEXT" twice quickly
    Then I see question "4/10"
    When I answer it and 500 ms have passed since it began to appear
    And I tap "NEXT"
    Then I see question "5/10"

  @next
  Scenario: Another screen chosen during a wait for pictures replaces it
    Given I am on the home page
    And pictures load slowly
    When I tap "SORT"
    And I tap "ALL DINOSAURS" before the sorting board's pictures load
    Then I see the dinosaur list
    And the sorting board never opens over it, nor counts a start

  @next
  Scenario: The latest dinosaur chosen during a wait wins
    Given I am on the list of every dinosaur
    And pictures load slowly
    When I tap the card of Velociraptor
    And I tap the card of Stegosaurus before its picture loads
    Then I see the page of Stegosaurus once its picture has loaded
    And the page of Velociraptor never opens

  @next
  Scenario: A second tap on a game's start deals no second round
    Given I am on the home page
    And pictures load slowly
    When I tap "SORT" twice quickly, before the pictures load
    Then one sorting board is dealt and loads
    And it opens once its pictures have loaded
