Feature: Skeleton assembly: age levels
  The skeleton game has a mode for each age level (docs/age-levels.md,
  docs/skeleton-levels.md). Its Hatchling mode is today's puzzle of four
  pieces. Each level plays its own cut of the skeleton: Explorer's is six
  to eight pieces, Paleontologist's ten to twelve
  (skeleton-assembly-pictures.feature); a level with no cut of its own
  plays Hatchling's. The selection screen's level switch is the
  child's own choice in this game (age-level-choice.feature), kept in the
  skeleton game's progress (skeleton-assembly-progress.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: The game starts at the age level
    Given the age level is <level>
    And I have never used the level switch
    When I open the skeleton game
    Then the level switch shows <level> chosen

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: The selection screen shows the level switch
    When I open the skeleton game
    Then I see the level switch above the dinosaurs: HATCHLING, EXPLORER and PALEONTOLOGIST, youngest first
    And it is the switch find the pair shows (find-the-pair-levels.feature), its pictures 🥚, 🦖 and 🦴
    And the chosen level stands out from the other two by more than colour
    And each level is at least 48 by 48 CSS pixels to tap
    And the five dinosaurs, three above and two centred below, "MUSEUM" and "HOME" are on a 1024 by 768 screen at once, with no scrolling

  Scenario Outline: The level switch reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I open the skeleton game on a 1024 by 768 screen
    Then each level's name is on one line, with at least 4.5:1 contrast with its background

    Examples:
      | language | theme |
      | English  | light |
      | English  | dark  |
      | Russian  | light |
      | Russian  | dark  |

  Scenario Outline: Each level plays its own cut
    Given the level switch shows <level> chosen
    When I tap Triceratops
    Then its puzzle has the pieces of <level>'s cut, or Hatchling's four while <level> has none of its own

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: A rebuild plays at the level the switch shows
    Given I have earned the Stegosaurus star
    And the level switch shows Paleontologist chosen
    When I tap "REBUILD" under the Stegosaurus in the museum
    Then its puzzle has the pieces of Paleontologist's cut, or Hatchling's four while it has none

  Scenario: The child's choice is remembered until a parent changes the level
    Given the age level is Explorer
    When I choose Hatchling on the level switch
    And I close and reopen the app and open the skeleton game
    Then the level switch shows Hatchling chosen
    When a parent chooses Paleontologist in the age level menu
    And I open the skeleton game
    Then the level switch shows Paleontologist chosen

  Scenario: A choice that cannot be saved holds while the app is open
    Given the age level is Explorer
    And the browser can read progress but cannot save it
    When I choose Paleontologist on the level switch and go home and back
    Then the level switch shows Paleontologist chosen
    But after reloading it shows Explorer chosen

  Scenario: Every level earns the same star and stand
    Given the level switch shows Explorer chosen
    When I finish the Triceratops skeleton
    Then I earn its one star and its museum stand, as at Hatchling
    And my collection score counts that star, the same at every level

  Scenario: Progress saved before the levels still reads
    Given my progress was saved before the game had levels, with the Tyrannosaurus star
    When I open the skeleton game
    Then the level switch shows the age level chosen
    And the Tyrannosaurus card shows its star and my best collection score is kept

  Scenario: A quick double tap on a level chooses it once
    When I tap EXPLORER twice quickly
    Then Explorer is chosen and nothing else changes

  Scenario: The level switch rests once a dinosaur is tapped
    When I tap Triceratops and another level at the same moment
    Then the puzzle starts at the level shown when I tapped Triceratops
    And the other level is kept nowhere
