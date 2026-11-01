Feature: A dinosaur's page on an iPhone on its side

  In a landscape window under 600 tall, an iPhone on its side, a
  dinosaur's page keeps its picture and its words side by side within
  the height.

  Scenario Outline: The stage and the words share the row
    Given the language is <language>
    And a window of <width> by <height> CSS pixels
    When a dinosaur's page opens from the catalogue
    Then the CATALOGUE button and the position stand on one short bar, 8 pixels under the top
    And the stage, its picture over the ← and → buttons, stands beside the words, each half the row
    And the page keeps 20 pixels past the notch on each side and clears the home indicator
    And every tap is at least 44 pixels

    Examples:
      | language | width | height |
      | English  | 667   | 375    |
      | English  | 852   | 393    |
      | English  | 932   | 430    |
      | Russian  | 667   | 375    |
      | Russian  | 852   | 393    |
      | Russian  | 932   | 430    |

  Scenario: The words scroll where they cannot fit
    Given a dinosaur's page on an iPhone on its side
    Then its name stands on one line and every word of its description fits its side
    And its two facts stand side by side
    And the words scroll within their side where they are taller than it

  Scenario: A taller window goes back to the iPad's layout
    Given a dinosaur's page on an iPhone on its side
    When the window grows past 600 tall
    Then the page takes the iPad's layout
