Feature: Dig: the brush, and Hatchling's free brushing
  The one interaction at every level: a finger brushes the sand off the
  dinosaur's body picture. The sand counts in cells, 40 by 30 over the
  picture's 800 by 600 frame; only the cells over the dinosaur, where
  its picture shows, count towards uncovering it. A cell is clear once
  more than half of it has lain under the brush's full width; the soft
  edge is only how the brush looks. At Hatchling the
  child brushes freely, and once 95% of the dinosaur's cells are clear
  the rest of the sand blows away in one gust, so the child digs the
  whole dinosaur but never hunts for its last grains. Explorer and
  Paleontologist brush the same way, on a board that never moves, so a
  held stroke clears under the finger as the question comes; their gust
  comes when the dinosaur is named (dig-question.feature). Taps on the
  sand go through the double-tap filter (double-tap.feature); an accepted
  cost is that a stroke begun within 500 ms and 100 px of a tap's
  release brushes nothing.

  Background:
    Given an iPad in landscape

  Scenario: A drag clears a soft round path
    Given a Hatchling round has started
    When I drag a finger across the sand
    Then the sand clears along the finger's path, a soft-edged round brush wide
    And the hollow's edge is crumbly, with a pale lip of grains around it and the sand's shadow inside
    And a darker bed of damp sand lies under the dinosaur, so the page never shows through
    And grains toss up and out from the brush as it moves, overshoot a little and settle as they fade
    And no ring or cursor marks the brush; the sand clearing under the finger is all it shows
    And with reduced motion the sand just clears, with no grains

  Scenario: A tap clears one round spot
    Given a Hatchling round has started
    When I tap the sand
    Then one soft round spot clears under the finger, a brush wide

  Scenario: The sand takes taps through the double-tap filter
    Given a Hatchling round has started
    When I tap the sand, and tap again 600 ms after the release, 50 px away
    Then two spots clear
    But a press less than 500 ms after a tap's release and less than 100 px from it clears nothing, its whole touch, as double-tap.feature says
    And a stroke begun after a drag is never swallowed, as a drag opens no window

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
    When I have brushed 95% of the dinosaur's cells clear
    Then the rest of the sand blows off the board in one stroke, out to one side, over about 0.8 s
    And with reduced motion the sand fades away instead
    And the dinosaur lifts from its damp bed with a warm glow, over about 0.5 s
    And on a first dig a star flies from it into the bar's "DUG UP" chip, then its count ticks up by one
    And on a repeated dig it lifts without a star
    And with reduced motion the lift, glow and star are a short fade and the count simply changes
    And the reveal follows the lift and star's arrival (dig-reveal.feature)

  Scenario: Brushing has no wrong place, no timer and no failure
    Given a round at any level has started
    When I brush anywhere, as slowly as I like, or wait without brushing
    Then nothing scolds, counts down or ends the round, and only help comes (dig-help.feature)

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
