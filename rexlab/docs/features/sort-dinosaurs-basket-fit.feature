Feature: Sort dinosaurs: a full basket's cards
  A basket keeps every card it holds readable and inside it (LAB-355).
  How the cards are laid out in it is the design's call, not this spec's.

  Scenario Outline: A full basket's cards stay readable
    Given the app is in either language
    When a basket holds the <cards> cards a <level> round can deal it
    And the screen is 1024 by 768, 1180 by 820, 1366 by 1024, 1506 by 807 or 1920 by 1080
    Then all its cards show inside the basket, none overlapping another or cut
    And each card shows its picture
    And each card shows its name on one line, in full and readable, or, where the basket has no room for that, no card in it shows its name
    And a card that shows no name keeps it for screen readers

    Examples:
      | level          | cards |
      | Hatchling      | 4     |
      | Explorer       | 6     |
      | Paleontologist | 6     |
