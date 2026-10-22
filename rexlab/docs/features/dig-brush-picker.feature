Feature: Dig: the brush picker
  DIG has two brushes, the brush and a wide one twice as big
  (dig-brush.feature gives their sizes), so a child can clear the sand
  fast and still brush round a detail. A picker on DIG's bar, before the
  FIELD GUIDE, chooses between them. The frames are the "Dig · Brushes"
  row of ../../design/rexlab.pen.

  Background:
    Given an iPad in landscape

  Scenario Outline: The bar's picker chooses the brush
    Given a <language> round at any level has started
    Then DIG's bar shows the brush picker before the FIELD GUIDE: two buttons side by side, each at least 48 by 48 CSS pixels, each a dot, the wide brush's twice as big as the brush's
    And the brush is picked, its button filled in the amber of DIG's mark, its dot dark
    When I tap the wide brush's button
    Then it is picked and the other is not, and the next stroke clears a path twice as wide
    And a screen reader reads them as "<brush>" and "<wide>", the picked one pressed
    And picking a brush clears no sand and is no brushing for help's wait (dig-help.feature)

    Examples:
      | language | brush | wide          |
      | English  | BRUSH | WIDE BRUSH    |
      | Russian  | КИСТЬ | ШИРОКАЯ КИСТЬ |

  Scenario: The picked brush stays while DIG is open
    Given I have picked the wide brush
    When the round ends and I dig again, or change level, or come back from the FIELD GUIDE
    Then the wide brush is still picked
    But leaving DIG for the home page and opening it again starts with the brush

  Scenario: The picker rests once the sand is gone
    Given a round's gust has come
    Then the picker's buttons do nothing until the next round
