Feature: Find the pair's board on a phone on its side
  On an iPhone held sideways the board keeps its rows and columns under
  a short bar, so every card can be turned without scrolling.

  Scenario Outline: The board stands whole under the bar
    Given a <width> by <height> window on its side
    When the <board> board is dealt
    Then the bar is 48 pixels tall
    And the cards stand <rows> by <columns>, wider than tall, 8 pixels apart
    And every card is more than 44 pixels tall

    Examples:
      | width | height | board          | rows | columns |
      | 667   | 375    | climb 1        | 2    | 3       |
      | 852   | 393    | climb 4        | 3    | 4       |
      | 932   | 430    | explorer       | 3    | 6       |
      | 667   | 375    | paleontologist | 4    | 6       |

  Scenario: BACK and HOME show their symbols only
    Given the board on a phone on its side
    Then BACK and HOME are 48-pixel squares
    And their names are kept for screen readers

  Scenario: The bar keeps one row in every language
    Given the board on a phone on its side in English or Russian
    Then BACK, HOME, the title, the climb level and the tries fit on one row

  Scenario: Growing past 600 tall brings back the iPad's board
    Given the board on a phone on its side
    When the window grows past 600 tall
    Then the board takes the iPad's layout again
