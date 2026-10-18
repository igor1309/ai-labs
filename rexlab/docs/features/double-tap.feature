Feature: A double tap counts as one tap
  A child of 5–7 often taps twice. A press less than 500 ms after the
  release of the last tap that counted, and less than 100 px from where
  it was released, is the second
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
      | the home page                 | the large card              | the game its tile opens         |
      | an answered question 3        | "NEXT"                      | question "4/10"               |
      | an answered question 10       | "SEE RESULT"                | the result screen             |
      | the compare result screen     | "PLAY AGAIN"                | question "1/10"               |
      | the compare result screen     | "HOME"                      | the home page                 |
      | the dinosaur list             | the card of Velociraptor    | the page of Velociraptor      |
      | the page of Tyrannosaurus     | the → button                | the page at "2 / 42"          |
      | the care welcome screen       | "NEW VISITOR"               | a care visit                  |
      | the find-the-pair welcome screen | "PLAY"                   | a board                       |
      | the skeleton selection screen | Triceratops                 | the Triceratops puzzle        |
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
    And <piece> of <to> will lie less than 100 px from where I tap <control>
    When I tap <control> and, 300 ms after its release, press <piece> and drag it
    Then <piece> does not move
    When I press <piece> a second later and drag it
    Then it moves with my finger

    Examples:
      | from                                  | control              | to                       | piece        |
      | the home page                         | the "SORT" tile      | the sorting board        | a card       |
      | the museum hall, Tyrannosaurus earned | its "REBUILD" button | the Tyrannosaurus puzzle | a bone piece |

  @next
  Scenario: A tap that was swallowed does not start a new window
    Given I am on the page of Tyrannosaurus, at "1 / 42"
    When I tap the → button three times at the same spot, each press 300 ms after the release before it
    Then I see the page at "3 / 42"

  @next
  Scenario: Two quick taps far apart both count
    Given I am on a board of find the pair
    When I tap two face-down cards more than 100 px apart, the second pressed 200 ms after the first's release
    Then both cards turn

  @next
  Scenario Outline: The window ends at 500 ms
    Given I am on the page of Tyrannosaurus, at "1 / 42"
    When I tap the → button twice at the same spot, the second pressed <gap> after the first's release
    Then I see the page at "<position>"

    Examples:
      | gap    | position |
      | 499 ms | 2 / 42   |
      | 500 ms | 3 / 42   |
