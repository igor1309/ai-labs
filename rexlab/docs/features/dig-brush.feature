Feature: Dig: the brush, and Hatchling's free brushing
  The one interaction at every level: a finger brushes the sand off the
  dinosaur's body picture. The sand counts in cells, 40 by 30 over the
  picture's 800 by 600 frame; only the cells over the dinosaur, where
  its picture shows, count towards uncovering it. A cell is clear once
  the brush has passed over more than half of it. At Hatchling the
  child brushes freely, and once 70% of the dinosaur's cells are clear
  the rest of the sand blows away in one gust. The brush is a component
  of its own, so the skeleton game's dig (LAB-283) can brush the same
  sand.

  Background:
    Given an iPad in landscape

  Scenario: A drag clears a soft round path
    Given a Hatchling round has started
    When I drag a finger across the sand
    Then the sand clears along the finger's path, a soft-edged round brush wide
    And grains puff from the brush as it moves
    And with reduced motion the sand just clears, with no grains

  Scenario: A tap clears one round spot
    Given a Hatchling round has started
    When I tap the sand
    Then one soft round spot clears under the finger, a brush wide

  Scenario Outline: The brush is a size a finger can steer
    Given a <level> round has started
    Then the brush is <size> CSS pixels across, whatever the board's size

    Examples:
      | level          | size |
      | Hatchling      | 48   |
      | Explorer       | 36   |
      | Paleontologist | 36   |

  Scenario: Only the dinosaur's cells count
    Given a Hatchling round has started
    When I brush every corner of the sand where no part of the dinosaur lies
    Then the corners clear
    But no cell of the dinosaur counts as clear, and no gust comes

  Scenario: Brushed sand stays brushed
    Given I have brushed part of the dinosaur clear
    When I brush the same place again, or lift and put down my finger
    Then the cleared sand stays clear, and the count of clear cells only grows

  Scenario: The last grains blow away at Hatchling
    Given a Hatchling round has started
    When I have brushed 70% of the dinosaur's cells clear
    Then the rest of the sand blows off the board in one gust, out to one side
    And with reduced motion the sand fades away instead
    And the reveal follows (dig-reveal.feature)

  Scenario: Brushing has no wrong place, no timer and no failure
    Given a round at any level has started
    When I brush anywhere, as slowly as I like, or wait without brushing
    Then nothing scolds, counts down or ends the round

  Scenario: Only one finger brushes
    Given I am brushing with one finger
    When a second finger touches the sand
    Then only the first finger brushes, and the page neither scrolls nor zooms

  Scenario: A mouse or pen brushes too
    Given a Hatchling round has started on a computer
    When I press and drag with a mouse over the sand
    Then the sand clears along the pointer's path as it does under a finger

  Scenario: A long press opens no menu
    Given a round has started
    When I hold a finger still on the sand
    Then no selection, callout or picture menu opens, and the spot under it clears

  Scenario: The board keeps its sand when the screen turns
    Given I have brushed half the dinosaur clear
    When the page's size changes, as when the iPad turns and back
    Then the same sand stays clear, scaled with the board
