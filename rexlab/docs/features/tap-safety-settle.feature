Feature: Every tap is safe to repeat: settling and replacing
  A new screen takes no tap or drag until it has settled: 500 ms have
  passed since it began to appear (docs/tap-safety.md, rules 1 and 4).
  While a change waits for its pictures, the child's latest different
  request, or an update to the screen showing, replaces it.

  Background:
    Given an iPad in landscape

  @next
  Scenario Outline: Taps wait until the new screen has settled
    Given <device>
    And I am on the home page
    When I tap "MUSEUM"
    And <while> I tap where a museum button stands and where "SORT" stood
    And after it has appeared but before 500 ms have passed since it began to, I tap them again
    Then none of those taps presses anything
    When 500 ms have passed since the museum began to appear
    Then a tap on its buttons works

    Examples:
      | device                                     | while                           |
      | the device does not ask for reduced motion | while the museum still appears, |
      | the device asks for reduced motion         | while the museum still appears, |
      | the browser runs no view transitions       | as the museum is shown,         |

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
      | device                                     | from                               | control   | board              | piece  |
      | the device does not ask for reduced motion | the home page                      | "SORT"    | the sorting board  | a card |
      | the device asks for reduced motion         | the home page                      | "SORT"    | the sorting board  | a card |
      | the browser runs no view transitions       | the home page                      | "SORT"    | the sorting board  | a card |
      | the device does not ask for reduced motion | the museum hall, Triceratops built | "REBUILD" | the skeleton board | a bone |

  @next
  Scenario: NEXT tapped twice goes one question on, and NEXT works again later
    Given I am on question "3/10", answered
    When I tap "NEXT" twice quickly
    Then I see question "4/10"
    When 500 ms have passed since it began to appear and I answer it
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
    And I tap the card of Stegosaurus before Velociraptor's picture loads
    Then I see the page of Stegosaurus once its picture has loaded
    And the page of Velociraptor never opens

  @next
  Scenario: A food chosen during a wait replaces it, and the card opens again
    Given I am on the list of every dinosaur
    And pictures load slowly
    When I tap the card of Velociraptor
    And I choose "MEAT" before Velociraptor's picture loads
    Then the page of Velociraptor never opens over the meat-eaters
    When I tap the card of Velociraptor again
    Then I see the page of Velociraptor once its picture has loaded

  @next
  Scenario Outline: The latest dinosaur chosen in a game wins
    Given I am on <screen>
    And pictures load slowly
    When I tap <first> and then <second> before the pictures of <first> load
    Then <opened> opens once its pictures have loaded
    And nothing of <first> opens
    And one start of <game> is counted

    Examples:
      | screen                                    | first                   | second                  | opened                            | game      |
      | the skeleton selection screen             | the card of Triceratops | the card of Stegosaurus | the Stegosaurus skeleton board    | SKELETONS |
      | the care friends screen, with two friends | the first friend        | the second friend       | a care visit of the second friend | CARE      |
