Feature: Sort dinosaurs: motion
  Every change on the board moves smoothly, as every change on screen
  does in RexLab, and falls back to short fades under reduced motion.

  Background:
    Given an iPad in landscape

  Scenario Outline: Every change on the board animates
    When <change>
    Then it changes smoothly, with the shared motion tokens
    And with reduced motion it changes with a short fade

    Examples:
      | change                                    |
      | the board enters                          |
      | a card is picked up                       |
      | a picked-up card is put down              |
      | a dragged card lights the basket under it |
      | a card lands and its ✓ appears            |
      | a progress step fills                     |
      | a card slides back                        |
      | a hint appears                            |
      | the right basket glows                    |
      | a hint goes away as its card lands        |
      | "SEE RESULT" appears                      |
