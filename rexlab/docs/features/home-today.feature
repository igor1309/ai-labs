Feature: Home page: today's game in the sky
  The top of the home page is the sky of a dig site. It holds one game a
  day, today's game, chosen as home-featured-choice.feature says, with
  its picture, its full name, its saved progress and PLAY. Today's game
  is not among the game tiles under the sky (home-games.feature), so no
  game is on the page twice. How each part looks is the dig-site
  design's; this feature says what it does.

  Scenario Outline: Today's game names itself in the sky
    Given the app is in <language>
    And <game> is today's featured game
    When I open the home page
    Then the sky shows a TODAY tag, <game>'s symbol, its full name "<name>" in large capitals and its dinosaurs
    And beside PLAY it shows <game>'s saved progress, as below

    Examples:
      | language | game    | name     |
      | English  | COMPARE | COMPARE  |
      | Russian  | COMPARE | СРАВНИ   |
      | English  | CARE    | CARE     |
      | Russian  | CARE    | ЗАБОТА   |

  Scenario Outline: Today's game keeps its progress
    Given <game> has <progress> in its saved progress
    When <game> is today's featured game and I open the home page
    Then the sky shows <progress> beside PLAY
    When I play it and come back home
    Then the sky shows the updated saved progress

    Examples:
      | game             | progress                                    |
      | COMPARE          | no best score, as I have not played it yet  |
      | COMPARE          | a best score of 0 with a trophy symbol      |
      | ANCIENT REPTILES | the dinosaur count                          |
      | CARE             | a best score of 7 with a trophy symbol      |
      | SORT             | a best score of 6 with a trophy symbol      |
      | FIND THE PAIR    | 120 stars with a star symbol                |
      | SKELETONS        | a collection best of 2 with a trophy symbol |
      | DIG              | 7 dinosaurs dug up with a star symbol       |
      | SAND WRITING     | no score or badge                           |

  Scenario Outline: PLAY starts today's game once
    Given <game> is today's featured game
    And I am on the home page
    When I tap PLAY twice quickly
    Then I see <destination>, opened once
    And <game> counts one more start

    Examples:
      | game             | destination                                               |
      | COMPARE          | question "1/10"                                           |
      | ANCIENT REPTILES | the dinosaur list                                         |
      | SORT             | a sorting round, at once, whatever its pictures are doing |
      | DIG              | a dig round, at once                                      |
      | SAND WRITING     | a blank full-screen sand canvas                           |

  Scenario Outline: PLAY opens a game's first screen
    Given <game> is today's featured game
    And I am on the home page
    When I tap PLAY twice quickly
    Then I see <destination>, opened once
    And no start of <game> is counted yet
    When I <begin>
    Then <game> counts one more start

    Examples:
      | game          | destination                      | begin             |
      | CARE          | the care welcome screen          | tap "NEW VISITOR" |
      | FIND THE PAIR | the find-the-pair welcome screen | tap "PLAY"        |
      | SKELETONS     | the skeleton selection screen    | choose a dinosaur |

  Scenario: The game's name and dinosaurs open it too
    Given COMPARE is today's featured game
    When I tap its name or one of its dinosaurs
    Then I see question "1/10", as PLAY would open it

  Scenario: Today's game is the same at every age level
    Given CARE is today's featured game
    When I open the home page at Hatchling, Explorer or Paleontologist
    Then the sky shows CARE, its progress and PLAY alike

  Scenario: The sky arrives smoothly
    Given the device does not ask for reduced motion
    When I open the home page
    Then today's game and its dinosaurs rise in with the shared motion tokens

  Scenario: Reduced motion fades the sky in
    Given the device asks for reduced motion
    When I open the home page
    Then today's game appears with a short fade and nothing moves
