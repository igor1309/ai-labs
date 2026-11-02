Feature: Home page: the game tiles in the ground
  Under the sky, every game but today's has a tile: its picture in a
  pocket dug into the ground and its short name beside a symbol. The
  tiles stand in rows, and each row is a deeper layer of earth. SOON
  ends them. How each part looks and how many tiles share a row are the
  dig-site design's; this feature says what they do.

  Scenario Outline: The tiles follow the game order, without today's game
    Given the app is in <language>
    And <featured> is today's featured game
    When I open the home page
    Then the tiles show <labels> in that order, reading each row left to right and the rows top to bottom
    And tapping each game's tile opens the same game PLAY would open for it; SOON opens nothing

    Examples:
      | language | featured | labels                                                                                      |
      | English  | CARE     | COMPARE, EXPLORE, PAIRS, BONES, DIG, SORT, DRAW, MAZE, PUZZLE, TEETH, COLOR, SOON            |
      | English  | COMPARE  | EXPLORE, PAIRS, BONES, DIG, SORT, CARE, DRAW, MAZE, PUZZLE, TEETH, COLOR, SOON               |
      | Russian  | COMPARE  | ЯЩЕРЫ, ПАРЫ, КОСТИ, КОПАЙ, СОРТИРУЙ, ЗАБОТА, РИСУЙ, ЛАБИРИНТ, ПАЗЛ, ЗУБЫ, РАСКРАСЬ, СКОРО |

  Scenario: Tiles show no progress
    Given every game has saved progress
    When I open the home page
    Then no tile shows a score, count, star or trophy

  Scenario: A whole game tile is one button
    When I tap a game tile's picture, its name or the ground between them
    Then its game opens once, however quickly I tap twice
    And a tap that closes an open parents' menu opens nothing

  Scenario: A game tile shows it is pressed
    When I press a game tile and hold
    Then it shows pressed from the moment of contact
    And under a pointer it brightens, and a finger leaves no hover behind

  Scenario Outline: A new game says it is new until it is started
    Given the app is in <language>
    And CARE is today's featured game
    And the app gained TEETH and COLOR after my first visit, and I have started neither
    When I open the home page
    Then the TEETH and COLOR tiles each carry a "<new>" tag, and no other tile does
    When I start TEETH and come back home
    Then only the COLOR tile carries a "<new>" tag

    Examples:
      | language | new     |
      | English  | NEW     |
      | Russian  | НОВИНКА |

  Scenario: A new game featured today shows no tag
    Given the app gained TEETH after my first visit, and I have not started it
    When TEETH is today's featured game
    Then the sky shows TEETH as on any day, with no NEW tag
    And no tile carries a NEW tag

  Scenario: Games there on the first visit are not new
    Given this is my first visit
    When I open the home page
    Then no tile carries a NEW tag

  Scenario: SOON is a picture, not a game
    When I open the home page
    Then SOON shows a faded dinosaur and a lock beside its word
    And it has no pressed state and opens nothing when tapped

  Scenario: Swiping only scrolls the page
    When I swipe up or down starting on a tile
    Then the page scrolls without opening a game or leaving a tile pressed

  Scenario: Tiles rise out of the ground
    Given the device does not ask for reduced motion
    When a row of tiles first comes into view
    Then its tiles rise in one after another with the shared motion tokens
    And a row seen before does not rise again until I come back home

  Scenario: Reduced motion fades the tiles
    Given the device asks for reduced motion
    When a row of tiles first comes into view
    Then it appears with a short fade
