Feature: A shared level-offer dialog in a tall window
  Games that offer another level keep the same dialog when the window is
  portrait and at least 600 CSS pixels wide. The dialog clears safe areas
  and keeps its question and both actions fully readable.

  Scenario Outline: The offer of a level fits a tall window
    Given the app is in <language>
    And a window of 600 by 800 CSS pixels
    When a game offers the "<level>" level in its dialog
    Then the dialog is the window less 24 a side, at most 710 wide
    And the question is in 32-pixel type, on at most three lines, none cut
    And "YES" and "NOT NOW" stand one above the other, each across the dialog, on one line

    # Each language uses its longest level name to prove the fit.
    Examples:
      | language | level          |
      | English  | PALEONTOLOGIST |
      | Russian  | ИССЛЕДОВАТЕЛЬ  |

