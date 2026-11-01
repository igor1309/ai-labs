Feature: Dig: pictures that load
  The dig game never waits for its pictures (pictures.feature): a round
  starts at once. The sand counts in the dig data's cells, not in the
  picture, so it brushes the same whatever the picture under it is
  doing. Where the picture shows, through brushed sand, on a card or on
  the reveal, its place shimmers while it loads, fades in once loaded,
  and shows the failure look of pictures.feature once it fails or is
  still loading after 8 seconds.

  Background:
    Given an iPad in landscape

  Scenario: A round starts at once while its picture loads
    Given the body picture of the next round's dinosaur is still loading
    When I tap "DIG"
    Then the round starts at once, the sand covering the board
    And where I brush the sand, the picture's place shimmers beneath it
    When the picture has loaded
    Then it fades in over 200 ms under the brushed sand

  Scenario: A round whose picture failed plays to its end
    Given a Hatchling round whose body picture has failed to load
    When I brush 95% of the dinosaur's cells clear
    Then the failure look shows beneath the brushed sand, and the gust and the reveal follow as in any round
    And the reveal shows the failure look in the dinosaur's place, its name large, and its star counts

  Scenario: Help's close-up loads as a picture does
    Given a round whose body picture is still loading
    When help thins a spot
    Then the spot's close-up shimmers through the sand, and once the picture fails it shows the failure look

  Scenario: A choice card whose picture failed can still be picked
    Given the question shows, one card's picture failed to load
    Then that card shows the failure look and can be tapped as any card
    And it fades if it is not the dinosaur under the sand, and blows the sand away if it is

  Scenario: Choice pictures load during the crossfade
    Given an Explorer or Paleontologist round before 75% clear
    When a choice picture loads, fails or reaches its loading limit
    Then its loading, loaded or failed look stays inside the card at its current dig-driven opacity
    And the card stays unavailable until the question unlocks
