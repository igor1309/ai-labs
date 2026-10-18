Feature: Sort dinosaurs: pictures that load
  Sorting never waits for its pictures (pictures.feature): a round starts
  at once, and each card's picture shimmers in its place until it has
  loaded, then fades in. A card is sorted the same way whatever its
  picture is doing. The failure look is the same on every card: it shows
  no number and is not sized by the dinosaur; the card's name and, after
  a miss, its hint tell the dinosaur.

  Background:
    Given an iPad in landscape

  Scenario Outline: A round starts at once while its pictures load
    Given I am on <screen>
    And the pictures of the next round's six dinosaurs are still loading
    When I tap "<button>"
    Then the round starts at once
    And each card shows its name, large and in capitals, below its picture's place, which shimmers at its picture's size
    When a card's picture has loaded
    Then it fades in over 200 ms

    Examples:
      | screen                                | button     |
      | the home page                         | SORT       |
      | the result screen of the sorting game | PLAY AGAIN |

  Scenario Outline: A card whose picture is not shown is sorted all the same
    Given a round whose picture of Stegosaurus <ends>
    When I <move> the Stegosaurus card to its right basket
    Then it lands in that basket, named, its picture's place there shimmering
    And the place shows <look>

    Examples:
      | ends                       | move            | look                                                   |
      | is still loading           | drag            | the picture fading in once it loads                    |
      | is still loading           | pick up and tap | the picture fading in once it loads                    |
      | failed to load on the tray | drag            | the failure look once the picture, loaded again, fails |
      | failed to load on the tray | pick up and tap | the failure look once the picture, loaded again, fails |

  Scenario Outline: A card whose picture is not shown goes back to the tray
    Given a round whose picture of Stegosaurus <ends>
    When I <let go of> the Stegosaurus card
    Then it slides back to its place, named, its picture's place shimmering as it goes
    And <also>
    And the place shows <look>

    Examples:
      | ends                       | let go of                    | also                                                         | look                                                   |
      | is still loading           | drag to the wrong basket     | it shows its hint, and its right basket glows, as any card's | the picture fading in once it loads                    |
      | failed to load on the tray | drag to the wrong basket     | it shows its hint, and its right basket glows, as any card's | the failure look once the picture, loaded again, fails |
      | is still loading           | let go away from the baskets | nothing is counted, as for any card                          | the picture fading in once it loads                    |
      | failed to load on the tray | let go away from the baskets | nothing is counted, as for any card                          | the failure look once the picture, loaded again, fails |

  Scenario: Cards still loading after 8 seconds show the failure look
    Given a round whose six pictures are still loading
    When 8 seconds pass
    Then each card's picture's place shows the failure look, its name still shown
    And each card can still be dragged, picked up and sorted
    And a card sorted or slid back is a new place for its picture: it shimmers again for up to 8 seconds of its own
    When a card's picture loads
    Then it fades in over 200 ms
