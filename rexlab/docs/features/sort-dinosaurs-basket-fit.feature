Feature: Sort dinosaurs: a full basket's cards
  A basket keeps every card it holds readable and inside it (LAB-355).

  Scenario Outline: A full basket's cards stay readable
    Given the app is in either language
    When a basket holds the <cards> cards a <level> round can deal it
    And the screen is 1024 by 768, 1180 by 820, 1366 by 1024, 1506 by 807 or 1920 by 1080
    Then its cards wrap into rows, apart, all inside the basket
    And the basket chooses the columns with the largest pictures that fit all names in one line at exactly 14px and at least 48px of picture above them
    And if no such layout fits, all name strips are hidden and the columns give the largest pictures alone, keeping their accessible names
    And no picture is under 40px tall where the basket has room for it

    Examples:
      | level          | cards |
      | Hatchling      | 4     |
      | Explorer       | 6     |
      | Paleontologist | 6     |
