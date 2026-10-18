Feature: Skeleton assembly: pictures that load
  Skeletons never wait for their pictures (pictures.feature): a puzzle
  starts at once, and each picture of the game, a choice's dinosaur, the
  outline, a bone or an exhibit, shimmers in its place until it has
  loaded, then fades in. A bone is fitted the same way whatever its
  picture is doing. A bone's shimmer fills its spot, and the outline
  shimmers faint, coming in with the screen as it does today. A bone
  lifted, fitted in its slot or floated back to its spot is a new place
  for its picture, as a sorted card is: a failed picture is loaded again
  there, and each place counts its own 8 seconds.

  Background:
    Given an iPad in landscape

  Scenario Outline: A puzzle starts at once while its pictures load
    Given I am on <screen>
    And the pictures of Tyrannosaurus's skeleton are still loading
    When I tap <control>
    Then the puzzle starts at once, its outline and four bones shimmering
    And <scatter>
    When a bone's picture has loaded
    Then it fades in over 200 ms, wherever the bone is

    Examples:
      | screen                      | control                   | scatter                                                               |
      | the skeleton selection      | Tyrannosaurus             | each bone shimmers in its spot in the tray                            |
      | the museum, its stand empty | Tyrannosaurus's "BUILD"   | each bone shimmers in its spot in the tray                            |
      | the museum, its stand built | Tyrannosaurus's "REBUILD" | each bone's shimmer scatters from its home on the outline to the tray |

  Scenario Outline: A bone whose picture is not shown is fitted all the same
    Given a puzzle whose picture of the skull <ends>
    When I drag the skull
    Then it is lifted at the size it fits on the board, a new place for its picture, <lifted>
    When I let it go on its home
    Then it fits, its place in its slot <look>

    Examples:
      | ends                       | lifted                                               | look                                                           |
      | is still loading           | shimmering                                           | shimmering, then fading the picture in once it loads           |
      | failed to load in the tray | shimmering while its picture is loaded again         | shimmering, then the failure look once, loaded again, it fails |

  Scenario Outline: A bone whose picture is not shown floats back all the same
    Given a puzzle whose picture of the skull <ends>
    When I let the skull go away from its home
    Then it floats back to its spot, shimmering, and nothing fits
    And its spot shows <look>

    Examples:
      | ends                       | look                                                 |
      | is still loading           | the picture fading in once it loads                  |
      | failed to load in the tray | the failure look once the picture, loaded again, fails |

  Scenario Outline: Every picture of the skeleton game shimmers until it has loaded
    Given the picture of <place> is still loading
    When I open <screen>
    Then I see <screen> at once, its controls working
    And the picture's place shimmers, then fades the picture in

    Examples:
      | place                          | screen                      |
      | the Tyrannosaurus choice       | the skeleton selection      |
      | Tyrannosaurus's built skeleton | the museum, its stand built |
      | Tyrannosaurus's silhouette     | the museum, its stand empty |
      | Tyrannosaurus's whole skeleton | the result of its skeleton  |

  Scenario Outline: A silhouette turns only its picture
    Given the picture of <stand>'s skeleton <ends>
    When I open the museum
    Then the stand's place shows <look> in the theme's colours, faint as the stand is, not turned into a silhouette
    And once a picture shows, it is turned into its silhouette, dark in the light theme and light in the dark

    Examples:
      | stand                         | ends             | look                              |
      | an empty stand                | is still loading | the shimmer                       |
      | an empty stand                | cannot load      | the failure look, its footprints  |
      | a stand awaiting rebuilding   | is still loading | the shimmer                       |
      | a stand awaiting rebuilding   | cannot load      | the failure look, its footprints  |
