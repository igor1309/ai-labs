Feature: Sort dinosaurs: age levels
  The sorting game has a mode for each age level (docs/age-levels.md).
  Its Hatchling mode is today's game: two baskets and six cards, by any
  property (sort-dinosaurs-start.feature). Explorer deals eight cards,
  and a diet board has a third basket, BOTH. Paleontologist deals ten
  cards, sorts only by legs or feathers, and always has a third basket:
  TWO OR FOUR for the dinosaurs that walked both ways, NOT KNOWN YET for
  those whose feathers no fossil shows (docs/sources.md). Drops, hints
  and stars work alike at every level (sort-dinosaurs-play.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: A round deals the level's cards and baskets
    Given the sorting game plays <level>
    When a round sorts by <property>
    Then I see <cards> dinosaur cards and the baskets <baskets>
    And I see <cards> progress steps, none of them filled

    Examples:
      | level          | property | cards | baskets                                   |
      | Hatchling      | diet     | 6     | PLANTS, MEAT                              |
      | Explorer       | diet     | 8     | PLANTS, MEAT, BOTH                        |
      | Explorer       | horns    | 8     | HORNS, NO HORNS                           |
      | Paleontologist | legs     | 10    | TWO LEGS, FOUR LEGS, TWO OR FOUR          |
      | Paleontologist | feathers | 10    | FEATHERS, NO FEATHERS, NOT KNOWN YET      |

  Scenario Outline: Each level sorts by its own properties
    Given the sorting game plays <level>
    When I start rounds in a row
    Then every round sorts by one of <properties>, never the one before

    Examples:
      | level          | properties                          |
      | Hatchling      | legs, diet, size, horns or feathers |
      | Explorer       | legs, diet, size, horns or feathers |
      | Paleontologist | legs or feathers                    |

  Scenario Outline: A third basket has its own symbol
    When a round shows the basket "<basket>"
    Then it has the <symbol> symbol

    Examples:
      | basket        | symbol                     |
      | BOTH          | leaf and drumstick         |
      | TWO OR FOUR   | 2 and 4 with footprints    |
      | NOT KNOWN YET | feather and question mark  |

  Scenario Outline: Every board of a level is fair
    When a <level> round is generated
    Then it holds <cards> different dinosaurs
    And each basket gets at least two of them
    And each dinosaur belongs in exactly one basket, by the shipped facts

    Examples:
      | level          | cards |
      | Hatchling      | 6     |
      | Explorer       | 8     |
      | Paleontologist | 10    |

  Scenario: The dinosaur list can fill every level's boards
    Given the dinosaur list the app ships with
    Then for every property a level sorts by it holds at least that level's cards with a clear basket
    And at least two of them for each of that level's baskets

  Scenario: A third basket holds only what the sources say
    Given the dinosaur list the app ships with
    Then BOTH holds exactly Gallimimus, Oviraptor and Troodon, and no two-basket diet board deals them
    And TWO OR FOUR holds exactly Iguanodon, Plateosaurus, Parasaurolophus, Edmontosaurus, Maiasaura and Corythosaurus
    And NOT KNOWN YET holds exactly Spinosaurus, Compsognathus, Gallimimus, Dilophosaurus, Giganotosaurus, Coelophysis, Baryonyx and Ceratosaurus
    And Tyrannosaurus, whose skin shows scales, goes in NO FEATHERS
    And the legs of Spinosaurus and Psittacosaurus and the feathers of Psittacosaurus and Heterodontosaurus are on no board

  Scenario Outline: The result scores the level's cards
    Given the sorting game plays <level>
    When I sort all <cards> cards, <right> of them right on the first drop
    Then I see "<right>/<cards>" and <cards> stars, <right> of them won

    Examples:
      | level          | cards | right |
      | Explorer       | 8     | 5     |
      | Paleontologist | 10    | 7     |

  Scenario Outline: Three baskets and more cards fit and read in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When a <level> round sorts by <property> on a 1024 by 768 screen
    Then the <cards> cards and 3 baskets all show with no scrolling
    And every basket's name reads in full, the third basket's "<third>"
    And each basket is at least 48 by 48 CSS pixels to drop on
    And each name keeps at least 4.5:1 contrast with its background

    Examples:
      | language | theme | level          | property | cards | third           |
      | English  | light | Paleontologist | legs     | 10    | TWO OR FOUR     |
      | English  | dark  | Paleontologist | feathers | 10    | NOT KNOWN YET   |
      | Russian  | light | Paleontologist | feathers | 10    | ПОКА НЕИЗВЕСТНО |
      | Russian  | dark  | Paleontologist | legs     | 10    | ДВЕ ИЛИ ЧЕТЫРЕ  |
      | Russian  | light | Explorer       | diet     | 8     | ВСЁ             |
