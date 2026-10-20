Feature: Sort dinosaurs: a full basket's cards
  A basket keeps every card it holds readable and inside it (LAB-355).

  Scenario Outline: A full basket's cards stay readable
    Given the app is in either language
    When a basket holds the <cards> cards a <level> round can deal it
    And the screen is 1024 by 768, 1180 by 820, 1366 by 1024, 1506 by 807 or 1920 by 1080
    Then its cards wrap into rows, apart, all inside the basket
    And each card is at least as wide as its picture and its name in one line at 14px need
    And each name is 14px wherever the basket's height has room for its rows
    And in a basket too short for its rows, the pictures give way first and then the names shrink to fit

    Examples:
      | level          | cards |
      | Hatchling      | 4     |
      | Explorer       | 6     |
      | Paleontologist | 6     |
