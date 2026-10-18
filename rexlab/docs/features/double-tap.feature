Feature: A double tap counts as one tap
  A child of 5–7 often taps twice. A tap that lands within 500 ms and
  100 px of the tap before it is the second tap of a double tap and does
  nothing, whatever the screen, so it never presses anything on the
  screen that appears next (docs/tap-safety.md, part 4).

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

  @next
  Scenario: A press that starts a drag is one tap too
    Given I am on the home page
    When I tap the "SORT" tile and, within 500 ms, press the same spot and drag
    Then nothing moves on the sorting board

  @next
  Scenario: Two quick taps far apart both count
    Given I am on a board of find the pair
    When I tap two face-down cards more than 100 px apart within 500 ms
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
