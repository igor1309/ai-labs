Feature: A double tap counts as one tap
  A child of 5–7 often taps twice. A press less than 500 ms after the
  last press that counted, and less than 100 px from it, is the second
  tap of a double tap: its whole gesture does nothing, whatever the
  screen, so it never presses anything on the screen that appears next
  (docs/tap-safety.md, part 4). The rows are examples, one or more of
  each kind of control; the filter covers every control.

  Background:
    Given an iPad in landscape

  @next
  Scenario Outline: The second tap presses nothing on the next screen
    Given I am on <from>
    When I tap <control> twice quickly
    Then I see <to>, opened once
    And the second tap pressed nothing on <to>

    Examples:
      | from                          | control                     | to                            |
      | the home page                 | the "COMPARE" tile          | question "1/10"               |
      | the home page                 | the "ALL DINOSAURS" tile    | the dinosaur list             |
      | the home page                 | the "CARE" tile             | the care welcome screen       |
      | the home page                 | the "SORT" tile             | a sorting round               |
      | the home page                 | the "FIND THE PAIR" tile    | the find-the-pair welcome screen |
      | the home page                 | the "SKELETONS" tile        | the skeleton selection screen |
      | the home page                 | "MUSEUM"                    | the museum hall               |
      | the home page                 | the large card              | its game, as its tile opens it |
      | an answered question 3        | "NEXT"                      | question "4/10"               |
      | an answered question 10       | "SEE RESULT"                | the result screen             |
      | the compare result screen     | "PLAY AGAIN"                | question "1/10"               |
      | the compare result screen     | "HOME"                      | the home page                 |
      | the dinosaur list             | the card of Velociraptor    | the page of Velociraptor      |
      | the page of Tyrannosaurus     | the → button                | the page at "2 / 42"          |
      | the care welcome screen       | "NEW VISITOR"               | a care visit                  |
      | the find-the-pair welcome screen | "PLAY"                   | a board                       |
      | the skeleton selection screen | the card of Triceratops     | the Triceratops puzzle        |
      | a skeleton result screen      | "BUILD ANOTHER"             | the skeleton selection screen |
      | the museum hall, Tyrannosaurus earned | its "REBUILD" button | the Tyrannosaurus puzzle      |
      | the page of Triceratops       | the ← button                | the page at "1 / 42"          |
      | the page of Tyrannosaurus     | "ALL DINOSAURS"             | the dinosaur list             |
      | a sorting round               | "HOME"                      | the home page                 |
      | the sorting result screen     | "PLAY AGAIN"                | a sorting round               |
      | the care welcome screen       | "FRIENDS"                   | the care friends screen       |
      | the skeleton selection screen | "MUSEUM"                    | the museum hall               |

  @next
  Scenario Outline: The second press of a double tap starts no drag
    Given I am on <from>
    When I tap <control> and, 300 ms later, press the same spot and drag
    Then nothing moves on <to>
    And a press there a second later drags as usual

    Examples:
      | from                                  | control              | to                         |
      | the home page                         | the "SORT" tile      | the sorting board          |
      | the museum hall, Tyrannosaurus earned | its "REBUILD" button | the Tyrannosaurus puzzle   |

  @next
  Scenario: A tap that was swallowed does not start a new window
    Given I am on the page of Tyrannosaurus, at "1 / 42"
    When I tap the → button three times at the same spot, 300 ms apart
    Then I see the page at "3 / 42"

  @next
  Scenario: Two quick taps far apart both count
    Given I am on a board of find the pair
    When I tap two face-down cards more than 100 px apart, 200 ms apart
    Then both cards turn

  @next
  Scenario Outline: The window ends at 500 ms
    Given I am on the page of Tyrannosaurus, at "1 / 42"
    When I tap the → button twice at the same spot, <gap> apart
    Then I see the page at "<position>"

    Examples:
      | gap    | position |
      | 499 ms | 2 / 42   |
      | 500 ms | 3 / 42   |
