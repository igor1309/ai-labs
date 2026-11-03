Feature: Dig: choosing a brush
  DIG has two brushes, the brush and a wide one twice as big
  (dig-brush.feature gives their sizes), so a child can clear the sand
  fast and still brush round a detail. On every board, in every window,
  the child can choose either brush and can always tell which one is
  picked. Where the choice sits and how it looks is the design's call,
  not this spec's.

  Scenario Outline: Either brush can be chosen on the board
    Given a <language> round at any level has started, in any window
    Then I can pick the brush or the wide brush without leaving the board
    And the picked brush is plain to see at a glance, apart from the other
    And each brush shows a symbol of its size beside its name, the wide brush's bigger
    And each brush can be picked with a tap on a target at least 48 by 48 CSS pixels
    When I pick the wide brush
    Then it is picked and the other is not, and the next stroke clears a path twice as wide
    And a screen reader reads them as "<brush>" and "<wide>", and says which one is picked
    And picking a brush clears no sand and is no brushing for help's wait (dig-help.feature)

    Examples:
      | language | brush | wide          |
      | English  | BRUSH | WIDE BRUSH    |
      | Russian  | КИСТЬ | ШИРОКАЯ КИСТЬ |

  Scenario: DIG opens with the brush
    When I open DIG from the home page
    Then the brush is picked

  Scenario: The picked brush stays while DIG is open
    Given I have picked the wide brush
    When the round ends and I dig again, or change level, or come back from the FIELD GUIDE, or turn the device
    Then the wide brush is still picked
    But leaving DIG for the home page and opening it again starts with the brush

  Scenario Outline: The choice rests once the sand is done
    Given a <level> round
    When <moment>
    Then picking a brush does nothing until the next round

    Examples:
      | level          | moment                        |
      | Hatchling      | the gust has come             |
      | Explorer       | I have picked the right name  |
      | Paleontologist | I have picked the right name  |
