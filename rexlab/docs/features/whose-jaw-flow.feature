Feature: Whose Jaw across a complete visit
  English and Russian share the same game, rewards and museum collection.

  Scenario Outline: Complete a round, inspect its finds and return after reload
    Given I choose <level> on the Whose Jaw welcome
    When I cancel a jaw drag outside the dinosaurs
    Then no try or reward is recorded
    When I place five different jaws correctly
    And I tap repeatedly during feedback
    Then exactly five teeth fill and the result awards three stars
    And the five jaws are collected immediately
    When I open the shelf from the result and inspect a collected jaw
    Then its name and short fact are spoken together after its pictures settle
    And its loaded jaw chomps exactly twice with its own sound
    When I dismiss its card
    Then speech and sound stop and focus returns to its place
    When I go home and reload the app
    Then the chosen level, best and five collected jaws remain
    And replay starts a fresh round with no errors or filled teeth
    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: Leaving feedback cancels the visit's work
    When I leave for welcome or home during feedback
    Then its sounds, speech and timers stop
    And a late callback cannot change a new round
    And pointer cancellation or a second finger cannot place a jaw

  Scenario: Pictures settle after a card is dismissed
    Given a collected card has loading pictures
    When I dismiss it or leave the shelf
    And those pictures finish loading
    Then its narration, sound and chomp do not start

  Scenario: Feedback follows the creature's actual mouth
    Given any of the sixteen gummy creatures is a choice
    When its mouth glows or a jaw and food appear
    Then each is positioned at that creature's mouth
    And the skull overlay fits the head rather than covering its body
    And a right-facing creature receives a mirrored skull

  Scenario: Welcome labels and portrait rewards fit
    Given I use English or Russian at an intermediate landscape width
    Then every level name fits its button beside its level picture
    When the window is narrow portrait
    Then level pictures remain usable with names available to screen readers
    When I finish a round at 390 by 844 or 820 by 1180
    Then the result, collection and all three actions fit without clipping
    And no orientation gate covers the result

  Scenario: Reduced motion preserves the full flow
    Given reduced motion is requested
    When I complete a round and visit the shelf
    Then the same rewards, navigation and narration are available
    And feedback and chomps use short fades
