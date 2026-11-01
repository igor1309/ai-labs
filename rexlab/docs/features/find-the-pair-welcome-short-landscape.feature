Feature: Find the pair's welcome on a phone on its side
  On an iPhone held sideways the welcome keeps the cards beside the
  title, the chips, the level switch and PLAY, all within the height.

  Scenario Outline: The welcome fits the window
    Given a <width> by <height> window on its side
    When find the pair's welcome opens
    Then HOME is a 48-pixel square of its house
    And the cards stand beside a 320-pixel column
    And the column fits the height without scrolling

    Examples:
      | width | height |
      | 568   | 320    |
      | 667   | 375    |
      | 852   | 393    |
      | 932   | 430    |

  Scenario: The level switch shows pictures only
    Given the welcome on a phone on its side
    Then each level shows its picture alone
    And its name is kept for screen readers

  Scenario: The title and PLAY keep one line in every language
    Given the welcome on a phone on its side in English or Russian
    Then the title fits beside its mark and PLAY fits the column

  Scenario: Growing past 600 tall brings back the iPad's welcome
    Given the welcome on a phone on its side
    When the window grows past 600 tall
    Then the welcome takes the iPad's layout again
