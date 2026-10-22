Feature: Dig: the choices fade in with the digging
  At Explorer and Paleontologist the question's dinosaur cards stand in
  their slots from the round's start, each over an empty "?" card, and
  show as the dinosaur is dug (dig-question.feature). Their opacity is
  nothing up to 10% dug, then eases in, the square of the way from 10%
  to 75%: ((dug - 10) / 65)², kept between 0 and 1, where dug is 100
  times the clear dinosaur cells over all its cells, unrounded. A grey
  picture shows plainly even faint, so it creeps in slowly at first
  rather than popping. The empty card's opacity is 1 less theirs.
  Opacities hold to 0.01. Hatchling has no question, so nothing fades.

  Background:
    Given an iPad in landscape

  Scenario Outline: Choices appear with the digging
    Given a round at each of Explorer and Paleontologist with each motion preference
    When I have brushed <dug>% of the dinosaur's cells clear
    Then each dinosaur card has opacity <opacity>
    And each empty card has opacity 1 minus <opacity>
    And before 75% the dinosaur cards cannot be pressed or focused and screen readers skip them
    And opacity follows the clear-cell fraction on every brush move during a stroke, without rounding to percent steps or a timed animation
    And the card container opacity never decreases as digging continues
    And a later wrong pick fades only its picture to 0.45, keeping the card container at 1
    And the dinosaur pictures stay desaturated until an answer is picked

    Examples:
      | dug | opacity |
      | 0   | 0       |
      | 10  | 0       |
      | 25  | 0.05    |
      | 40  | 0.21    |
      | 50  | 0.38    |
      | 60  | 0.59    |
      | 75  | 1       |
      | 90  | 1       |

  Scenario: A round gives back its current crossfade
    Given an Explorer or Paleontologist round with choices partly visible, or a wrong pick rejected
    When I turn the iPad to portrait and back, or open the FIELD GUIDE and return
    Then the same sand, choice order, card and empty-card opacity, title and rejected picks return
    And choices remain unavailable until 75% of the dinosaur is clear

  Scenario: A new round begins with invisible choices
    Given I have partly brushed a round, or finished it after a wrong pick
    When I leave for HOME and start DIG, or start the next round with DIG AGAIN
    Then the new round has all sand, dinosaur cards at zero opacity and empty cards at full opacity
    And its title reads "DIG", no choices are rejected and none can be picked yet

  Scenario: The pictures may load late
    Given dinosaur cards are fading in before their pictures have loaded
    Then each card shows the shared loading look, then its picture or the failed look, all at the card's current opacity
    And every unrejected card can be picked once the question shows
