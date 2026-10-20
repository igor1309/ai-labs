Feature: Sort dinosaurs: a full basket's cards
  A basket keeps every card it holds readable and inside it (LAB-355).

  Scenario Outline: A full basket's cards stay readable
    Given the app is in either language
    When a basket holds the <cards> cards a <level> round can deal it
    And the screen is 1024 by 768, 1180 by 820, 1366 by 1024, 1506 by 807 or 1920 by 1080
    Then its cards wrap into rows, apart, all inside the basket
    And each card is at least as wide as its picture and its name in one line at 14px need
    And a card with room for its picture and its name in one line shows the name at exactly 14px
    And otherwise the name strip is hidden, the picture fills the card, and its accessible name is kept

    Examples:
      | level          | cards |
      | Hatchling      | 4     |
      | Explorer       | 6     |
      | Paleontologist | 6     |
