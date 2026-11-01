Feature: Find the pair's level offer on a phone on its side
  On an iPhone held sideways the offer of the next level fits the
  window, so the child can answer it without scrolling.

  Scenario Outline: The offer fits the window
    Given a <width> by <height> window on its side
    When the result offers the <level> level in <language>
    Then the question takes at most two lines
    And YES and NOT NOW stand side by side, each 52 tall
    And the whole offer fits the height

    Examples:
      | width | height | level          | language |
      | 568   | 320    | explorer       | Russian  |
      | 667   | 375    | paleontologist | English  |
      | 852   | 393    | explorer       | English  |
      | 932   | 430    | paleontologist | Russian  |
