Feature: Find the pair: age levels
  Find the pair has a mode for each age level (docs/age-levels.md). Its
  Hatchling mode is today's game, the climb from 3 to 6 pairs that
  find-the-pair-start.feature calls levels 1 to 4. Explorer and
  Paleontologist each deal one larger board, a picture to its
  silhouette; Paleontologist's turns to a skeleton in LAB-301. The welcome screen's level switch is the child's own
  choice in this game (age-level-choice.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: The game starts at the age level
    Given the age level is <level>
    And I have never used the level switch
    When I open find the pair
    Then the level switch shows <level> chosen

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: The welcome screen shows the level switch
    When I open find the pair
    Then I see the level switch above "PLAY": HATCHLING, EXPLORER and PALEONTOLOGIST, youngest first
    And each shows its picture from the age level menu: 🥚, 🦖 and 🦴
    And the chosen level stands out from the other two by more than colour
    And each level is at least 48 by 48 CSS pixels to tap

  Scenario Outline: The level switch fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I open find the pair on a 1024 by 768 screen
    Then the switch reads <hatchling>, <explorer> and <paleontologist>, each on one line
    And each name keeps at least 4.5:1 contrast with its background

    Examples:
      | language | theme | hatchling | explorer      | paleontologist |
      | English  | light | HATCHLING | EXPLORER      | PALEONTOLOGIST |
      | English  | dark  | HATCHLING | EXPLORER      | PALEONTOLOGIST |
      | Russian  | light | ДЕТЁНЫШ   | ИССЛЕДОВАТЕЛЬ | ПАЛЕОНТОЛОГ    |
      | Russian  | dark  | ДЕТЁНЫШ   | ИССЛЕДОВАТЕЛЬ | ПАЛЕОНТОЛОГ    |

  Scenario Outline: Choosing a level moves
    Given the device <motion>
    When I choose another level on the switch
    Then the chosen mark moves to it, and the climb level shows or hides, <how>

    Examples:
      | motion                          | how                           |
      | does not ask for reduced motion | with the shared motion tokens |
      | asks for reduced motion         | with short fades              |

  Scenario: Hatchling plays today's climb
    Given the level switch shows Hatchling chosen
    When I tap "PLAY"
    Then I see my climb level's board, as find-the-pair-start.feature says

  Scenario Outline: Explorer and Paleontologist deal larger boards
    Given the level switch shows <level> chosen
    When I tap "PLAY"
    Then I see <pairs> pairs of face-down cards in <rows> rows of <columns>
    And each pair matches a picture to its silhouette

    Examples:
      | level          | pairs | rows | columns |
      | Explorer       | 9     | 3    | 6       |
      | Paleontologist | 12    | 4    | 6       |

  Scenario: The climb level shows only for Hatchling
    Given the level switch shows Hatchling chosen
    Then I see my climb level as a number with a ladder symbol, and my stars
    When I choose Explorer
    Then I see my stars and no climb level

  Scenario Outline: A large board and its result fit the iPad
    When a <level> board is dealt on a <width> by <height> screen
    Then all its cards and "HOME" are on the screen at once, with no scrolling
    And every card is at least <size> by <size> CSS pixels
    When I finish it
    Then its result shows every dinosaur's name, my tries, stars and best, "PLAY AGAIN" and "HOME" with no scrolling

    Examples:
      | level          | width | height | size |
      | Explorer       | 1024  | 768    | 130  |
      | Paleontologist | 1024  | 768    | 120  |
      | Paleontologist | 1366  | 1024   | 150  |

  Scenario: A quick double tap on a level chooses it once
    When I tap EXPLORER twice quickly
    Then Explorer is chosen and nothing else changes

  Scenario: The level switch rests once "PLAY" is tapped
    Given the next board's pictures are still loading after I tap "PLAY"
    When I tap another level
    Then nothing changes, and the board is dealt at the level shown when I tapped "PLAY"
