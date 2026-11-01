Feature: Dinosaur care: pictures that load
  Care never waits for its pictures (pictures.feature): a visit starts at
  once, and each picture of care, the visitor's, a friend's or an
  item's, shimmers in its place until it has loaded, then fades in.

  Background:
    Given an iPad in landscape

  Scenario: A visit starts at once while its visitor's picture loads
    Given I am on the care welcome screen
    And the new visitor's picture is still loading
    When I tap "NEW VISITOR"
    Then the visit starts at once, its visitor walking in as a shimmer at its picture's size
    And I see its name and its need, and I can give it an item
    And while the picture loads, the visitor's reactions and dance move its place, shimmering or showing the failure look
    When the picture has loaded
    Then it fades in over 200 ms

  Scenario Outline: A visitor whose picture is missing is still cared for
    Given I am on the care welcome screen
    And the new visitor's picture <ends>
    When I tap "NEW VISITOR"
    Then the visitor's place shows the failure look <when>, its name still shown
    And I can care for the visitor until its last need is met

    Examples:
      | ends             | when                               |
      | fails to load    | once the picture has failed        |
      | is still loading | once the visit has shown 8 seconds |

  Scenario Outline: Every picture of care shimmers until it has loaded
    Given the picture of <place> is still loading
    When I open <screen>
    Then I see <screen> at once, its controls working
    And the picture's place shimmers, then fades the picture in

    Examples:
      | place                         | screen                                         |
      | the visitor at the door       | the care welcome screen                        |
      | my friend Triceratops's face  | the care welcome screen, Triceratops my friend |
      | the plants button             | a visit                                        |
      | the bowl in the need's bubble | a visit, its visitor hungry                    |
      | the item given                | a visit, after I give an item                  |
      | the finished visitor          | the result of a visit                          |
      | my friend Triceratops's card  | my friends                                     |
      | the nest                      | my friends, with no friend yet                 |
