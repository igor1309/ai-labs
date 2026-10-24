Feature: Compare dinosaurs quiz: a question in a tall-narrow window
  In a tall-narrow window, portrait and under 600 CSS pixels wide (an
  iPhone upright), a question of the compare dinosaurs quiz stands
  upright as in a tall window, on 20-pixel sides and with less room
  between its parts: the bar, the prompt, the cards and the row for
  "NEXT" are 20 apart, the page's padding is 24 at the top and 32 at the
  bottom, and the two cards are 16 apart. "HOME" shows its house alone,
  a 56-pixel square, and keeps its word for screen readers; the steps
  and the position keep the rest of the bar. A card's picture has
  16-pixel padding and its footer 20; a card is never shorter than a
  110-pixel picture with its padding and its footer, and below that the
  whole screen scrolls. The prompt and the names take the type as in a
  tall window, from the width less the 20-pixel sides, so every prompt
  and name in either language fits from 320 wide. The marks, the values'
  chips, "VS" and "NEXT" keep their sizes; every tap is at least 44
  pixels. The result still asks to turn or widen.

  Scenario Outline: A question stands upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I start the compare quiz
    Then I see no picture asking to turn sideways or to make the window wider
    And the house, the steps and "1/10" stand in one row at the top
    And under the prompt each card is <card> pixels tall, its picture <picture> tall
    And the screen <scrolls>

    Examples:
      | width | height | card | picture | scrolls         |
      | 320   | 568    | 206  | 110     | scrolls         |
      | 375   | 667    | 211  | 110     | scrolls         |
      | 393   | 759    | 222  | 119     | does not scroll |
      | 393   | 852    | 268  | 165     | does not scroll |
      | 430   | 932    | 308  | 202     | does not scroll |

  Scenario Outline: Every word fits the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I start the compare quiz
    Then every prompt and every name stands on one line in one type, the names at least 18 pixels

    Examples:
      | language |
      | English  |
      | Russian  |
