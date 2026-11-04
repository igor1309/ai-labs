Feature: Compare dinosaurs quiz: a question in a tall-narrow window
  In a tall-narrow window, portrait under 600 CSS pixels wide or landscape
  under 568 wide, the sky holds the house, steps and position over the
  prompt. HOME is a 56-pixel square showing its house, with its word kept
  accessible. Two pocket cards stack in the sand, with VS (ИЛИ in Russian)
  centred on their seam. Each picture is at least 110 CSS pixels high.
  The cards share the available height equally; the whole page, sky
  included, scrolls vertically only when the minimum content cannot fit.
  NEXT follows the cards, across the width and 64 pixels tall.
  Dig-site tokens size type, colours, spacing and pockets; every prompt,
  name and value fits from 320 pixels wide and every tap is at least 44.

  Scenario Outline: A question stands upright in a narrow window
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I start the compare quiz
    Then no orientation gate covers the question
    And the house, steps and 1/10 stand in one row above the prompt
    And equal-height cards stack with pictures at least 110 CSS pixels high
    And NEXT follows them without a nested board scroll
    And the whole screen scrolls vertically only when its minimum content cannot fit

    Examples:
      | width | height |
      | 320   | 568    |
      | 375   | 667    |
      | 393   | 759    |
      | 393   | 852    |
      | 430   | 932    |

  Scenario Outline: Every word fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I start the compare quiz
    Then every prompt and every name stands on one line in one type, the names at least 18 pixels

    Examples:
      | language |
      | English  |
      | Russian  |
