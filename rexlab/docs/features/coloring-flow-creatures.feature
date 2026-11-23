@next
Feature: Coloring creature age variants and saved drawings
  Coloring keeps one shared collection, tools and Explorer collection best.
  The global age setting chooses each creature’s artwork for new gallery
  selections; saved works always keep their original geometry.

  Scenario Outline: Mosasaurus age variants and saved drawings
    Given the global age setting is <level>
    When I choose Mosasaurus from the coloring gallery
    Then the workshop opens <geometry> with matching preview and localized name
    When I paint, save and reopen this work after changing the global age setting
    Then its original geometry, paint, undo history, thumbnail and earned star are retained
    And returning to the gallery offers the Mosasaurus for the current global age level
    And existing creatures and their saved works, including T-Rex, remain unchanged

    Examples:
      | level          | geometry               |
      | Hatchling      | mosasaurus-hatchling-1 |
      | Explorer       | mosasaurus-explorer-2  |
      | Paleontologist | mosasaurus-explorer-2  |

  Scenario Outline: Brachiosaurus age variants and saved drawings
    Given the global age setting is <level>
    When I choose Brachiosaurus from the coloring gallery
    Then the workshop opens <geometry> with matching preview and localized name
    When I paint, save and reopen this work after changing the global age setting
    Then its original geometry, paint, undo history, thumbnail and earned star are retained
    And returning to the gallery offers the Brachiosaurus for the current global age level
    And existing creatures and their saved works, including Mosasaurus, remain unchanged

    Examples:
      | level          | geometry                  |
      | Hatchling      | brachiosaurus-hatchling-1 |
      | Explorer       | brachiosaurus-explorer-2  |
      | Paleontologist | brachiosaurus-explorer-2  |

  Scenario Outline: Pteranodon age variants and saved drawings
    Given the global age setting is <level>
    When I choose Pteranodon from the coloring gallery
    Then the workshop opens <geometry> with matching preview and localized name
    When I paint, save and reopen this work after changing the global age setting
    Then its original geometry, paint, undo history, thumbnail and earned star are retained
    And returning to the gallery offers the Pteranodon for the current global age level
    And existing creatures and their saved works, including Brachiosaurus, remain unchanged

    Examples:
      | level          | geometry               |
      | Hatchling      | pteranodon-hatchling-1 |
      | Explorer       | pteranodon-explorer-2  |
      | Paleontologist | pteranodon-explorer-2  |

  Scenario Outline: Parasaurolophus age variants and saved drawings
    Given the global age setting is <level>
    When I choose Parasaurolophus from the coloring gallery
    Then the workshop opens <geometry> with matching preview and localized name
    When I paint, save and reopen this work after changing the global age setting
    Then its original geometry, paint, undo history, thumbnail and earned star are retained
    And returning to the gallery offers the Parasaurolophus for the current global age level
    And existing creatures and their saved works, including Pteranodon, remain unchanged

    Examples:
      | level          | geometry                    |
      | Hatchling      | parasaurolophus-hatchling-1 |
      | Explorer       | parasaurolophus-explorer-1  |
      | Paleontologist | parasaurolophus-explorer-1  |

  Scenario Outline: Spinosaurus age variants and saved drawings
    Given the global age setting is <level>
    When I choose Spinosaurus from the coloring gallery
    Then the workshop opens <geometry> with matching preview and localized name
    When I paint, save and reopen this work after changing the global age setting
    Then its original geometry, paint, undo history, thumbnail and earned star are retained
    And returning to the gallery offers the Spinosaurus for the current global age level
    And existing creatures and their saved works, including Parasaurolophus, remain unchanged

    Examples:
      | level          | geometry                |
      | Hatchling      | spinosaurus-hatchling-1 |
      | Explorer       | spinosaurus-explorer-3  |
      | Paleontologist | spinosaurus-explorer-3  |
