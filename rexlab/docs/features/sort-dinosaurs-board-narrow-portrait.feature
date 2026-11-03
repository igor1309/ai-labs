Feature: Sort dinosaurs: the board in a tall-narrow window
  On a phone upright the sorting board plays upright too, with no ask to
  turn sideways. Play is as sort-dinosaurs-play.feature tells. A basket a
  third of a phone wide may show its mark without its name, and "HOME"
  its house without its word, so long as each keeps its name for screen
  readers. Where the parts sit, their sizes, spacing and type are the
  design's call, not this spec's.

  Scenario Outline: The board plays upright on a phone
    Given a window of <width> by <height> CSS pixels, with no safe areas
    When I start a <level> board
    Then I see no picture asking to turn sideways or to make the window wider
    And I see "HOME", the progress steps, the prompt, every card on the tray and every basket, none cut
    And the baskets are below the tray
    And the screen <scrolls>

    Examples:
      | width | height | level          | scrolls                                              |
      | 393   | 852    | Hatchling      | does not scroll                                      |
      | 393   | 852    | Explorer       | does not scroll                                      |
      | 393   | 852    | Paleontologist | does not scroll                                      |
      | 430   | 932    | Paleontologist | does not scroll                                      |
      | 320   | 568    | Hatchling      | may scroll, rather than squeeze a card past readable |

  Scenario Outline: Every card, mark and the prompt read on the narrowest phone
    Given the language is <language>
    And a window of 320 by 568 CSS pixels
    When I see a board of any baskets a level deals
    Then every dinosaur's name stands on one line on its card, none cut
    And every basket's mark shows whole inside its basket, BIG's and SMALL's footprints told apart
    And the prompt reads in full beside its symbol
    And every basket and "HOME" is named for screen readers

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: Every tap is easy to hit on a phone
    Given a window of 393 by 852 CSS pixels
    When a Paleontologist round starts
    Then "HOME", each card and each basket is at least 44 by 44 CSS pixels to tap or drop on

  Scenario: The board stays as the window narrows to a phone's
    Given a sorting board upright in a tall window, with 3 cards sorted and one wrong drop
    When the window narrows to 393 by 852
    Then the board stays, with no picture asking to turn
    And the 3 cards are still in their baskets and the wrong drop still counts
