Feature: Find the pair: pictures that load
  Find the pair never waits for its pictures (pictures.feature): a board
  is dealt at once, and each picture shimmers in its place until it has
  loaded, then fades in. A card is turned and matched the same way
  whatever its picture is doing. Its rules hold at every age level.

  Background:
    Given an iPad in landscape

  Scenario: A board is dealt at once while its pictures load
    Given the pictures of the next board are still loading
    When I tap "PLAY"
    Then the board appears at once, its cards dealt one after the other
    And its pictures go on loading while the cards lie face down
    When I turn over a card whose picture is still loading
    Then its face shimmers at the picture's size, then fades the picture in

  Scenario Outline: The pictures of the welcome and result screens shimmer until they have loaded
    Given the picture of <place> is still loading
    When I open <screen>
    Then I see <screen> at once, its controls working
    And the picture's place shimmers, then fades the picture in

    Examples:
      | place                               | screen                           |
      | the welcome card and its silhouette | the find-the-pair welcome screen |
      | a dinosaur found                    | the result of a board            |

  Scenario Outline: A card whose picture is not shown still lets the board be played
    Given the picture of Stegosaurus <ends>
    When I turn over a Stegosaurus card
    Then I see "STEGOSAURUS" on the card at once, over its picture's shimmer
    And its place shows the failure look <when>
    And the other card of its pair, turned over, is named and shown the same way
    And each time a card is turned over, its 8 seconds count afresh

    Examples:
      | ends                                         | when                                       |
      | failed to load while the cards lay face down | once the picture, loaded again, has failed |
      | is still loading                             | once the card has been open 8 seconds      |

  Scenario: A card's name fades out as its picture fades in
    Given the picture of Stegosaurus is still loading
    When I turn over a Stegosaurus card
    And the picture loads while the card is open
    Then the picture fades in over 200 ms and "STEGOSAURUS" fades out with it
    But a card whose pair is found keeps its name

  Scenario: A silhouette darkens only its picture
    Given a board at the level of silhouettes, its pictures still loading
    When I turn over a silhouette card
    Then its place shimmers in the theme's colours, not darkened
    And once the picture shows, it is darkened into its silhouette
