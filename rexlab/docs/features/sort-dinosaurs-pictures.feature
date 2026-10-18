Feature: Sort dinosaurs: pictures that load
  Sorting never waits for its pictures (pictures.feature): a round starts
  at once, and each card's picture shimmers in its place until it has
  loaded, then fades in. A card is sorted the same way whatever its
  picture is doing.

  Background:
    Given an iPad in landscape

  Scenario Outline: A round starts at once while its pictures load
    Given I am on <screen>
    And the pictures of the next round's six dinosaurs are still loading
    When I tap "<button>"
    Then the round starts at once
    And each card shows its name, large and in capitals, under its picture's shimmer, at its picture's size
    When a card's picture has loaded
    Then it fades in over 200 ms

    Examples:
      | screen                                | button     |
      | the home page                         | SORT       |
      | the result screen of the sorting game | PLAY AGAIN |

  Scenario Outline: A card whose picture is not shown is sorted all the same
    Given a round whose picture of Stegosaurus <ends>
    When I <move> the Stegosaurus card to its right basket
    Then it lands in that basket, named, its picture's place <look>

    Examples:
      | ends             | move            | look                                                       |
      | is still loading | drag            | shimmering until the picture loads, then fading it in      |
      | is still loading | pick up and tap | shimmering until the picture loads, then fading it in      |
      | fails to load    | drag            | showing the failure look once, loaded again, it has failed |
      | fails to load    | pick up and tap | showing the failure look once, loaded again, it has failed |

  Scenario: A card whose picture is not shown goes back to the tray on a miss
    Given a round whose picture of Stegosaurus is still loading
    When I drag the Stegosaurus card to the wrong basket
    Then it slides back to its place, named, its picture's place shimmering as it goes
    And the right basket glows, as for any card

  Scenario: Cards still loading after 8 seconds show the failure look
    Given a round whose six pictures are still loading
    When 8 seconds pass
    Then each card's picture's place shows the failure look, its name still shown
    And each card can still be dragged, picked up and sorted
    When a card's picture loads
    Then it fades in over 200 ms
