Feature: DIG's reveal on a phone on its side
  On an iPhone held sideways the dinosaur dug up stands on the left and
  its reward beside it, so the child sees it whole with its name, DUG UP
  and the ways on, nothing cut off.

  Scenario Outline: The reveal fits the window
    Given a <width> by <height> window on its side in <language>
    When the child digs up a dinosaur at Hatchling and its star lands
    Then the dinosaur stands left of a column under a short bar
    And the column holds its name, DUG UP, the celebration, the level switch and DIG AGAIN beside HOME, within the height
    And the level switch shows each level's picture, its name read out by a screen reader

    Examples:
      | width | height | language |
      | 568   | 320    | Russian  |
      | 667   | 375    | English  |
      | 852   | 393    | Russian  |
      | 932   | 430    | English  |

  Scenario: The fullest card
    Given a dinosaur dug up last, new, with its badge
    Then DUG UP's star, words, count, NEW!, trophy and badge fit the column's width
