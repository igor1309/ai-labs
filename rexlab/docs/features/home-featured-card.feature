Feature: Home page: the featured card and the tiles
  The large card on the left of the home page features one game a day, as
  an extra door beside that game's own tile. Every tile keeps a fixed place,
  so a child who cannot read yet finds a game by its picture where it was
  last time, whichever game is featured. When this is built it replaces the
  fixed COMPARE card of compare-dinosaurs-start.feature; COMPARE then
  takes the first tile of the row, and the layout scenarios of
  home-tiles.feature and of each game's start feature change with it. The
  row scrolls and fits its words as home-tiles.feature says. The choice is
  in home-featured-choice.feature.

  Background:
    Given an iPad in landscape
    And the games, in tile order, are COMPARE, ALL DINOSAURS, CARE, SORT, FIND THE PAIR and SKELETONS

  Scenario: The featured card is an extra door; every tile keeps its place
    Given CARE is today's featured game
    When I open the home page
    Then the large card on the left shows CARE with its picture and its name in large capitals
    And the tiles show COMPARE, ALL DINOSAURS, CARE, SORT, FIND THE PAIR and SKELETONS in that order, then "MORE COMING"
    When SKELETONS is featured on another day
    Then every tile is in the same place as before


  Scenario Outline: The featured card shows what its tile shows
    Given <game> is today's featured game
    And its tile shows <badge>
    When I open the home page
    Then the large card shows <badge> too
    When I finish a game and go home
    Then the large card and the tile show the same, updated value

    Examples:
      | game          | badge                                       |
      | COMPARE       | no best score, as I have not played it yet  |
      | COMPARE       | a best score of 0 with a trophy symbol      |
      | ALL DINOSAURS | the dinosaur count                          |
      | CARE          | a best score of 7 with a trophy symbol      |
      | SORT          | a best score of 6 with a trophy symbol      |
      | FIND THE PAIR | 120 stars with a star symbol                |
      | SKELETONS     | a collection best of 2 with a trophy symbol |


  Scenario Outline: The featured card opens its game as its tile does
    Given <game> is today's featured game
    And I am on the home page
    When I tap the large card twice quickly
    Then I see <destination>, opened once
    And <starts> counted, as for its tile

    Examples:
      | game          | destination                                    | starts                        |
      | COMPARE       | question "1/10", once its pictures have loaded | one start of COMPARE is       |
      | ALL DINOSAURS | the dinosaur list                              | one start of ALL DINOSAURS is |
      | CARE          | the care welcome screen                        | no start is                   |
      | SORT          | a sorting round, once its pictures have loaded | one start of SORT is          |
      | FIND THE PAIR | the find-the-pair welcome screen               | no start is                   |
      | SKELETONS     | the skeleton selection screen                  | no start is                   |


  Scenario: The large card stays while the tiles scroll
    Given I am on the home page
    When I swipe the tiles to the left until they stop
    Then I see "MORE COMING" at the right edge
    And the large card stays in place, showing today's featured game


  Scenario: The featured card moves smoothly
    Given the device does not ask for reduced motion
    When I open the home page
    Then the featured card fades in with a slight lift using the shared motion tokens


  Scenario: Reduced motion fades the featured card
    Given the device asks for reduced motion
    When I open the home page
    Then the featured card appears with a short fade and no lift
