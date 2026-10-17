@next
Feature: Skeleton assembly: the dinosaur's fact
  Each reveal (skeleton-assembly-result.feature) presents one short
  anatomy fact in the chosen language, and speaks it once read-aloud
  (LAB-275) is available, without ever holding the result back.

  Background:
    Given an iPad in landscape

  Scenario Outline: Each reveal presents one short anatomy fact
    Given I finish <dinosaur>
    Then I see exactly one fact: "<fact>"
    And the fact is one short sentence in capitals beside the dinosaur picture

    Examples:
      | dinosaur      | fact                                           |
      | Tyrannosaurus | T. REX HAD TINY ARMS BUT HUGE LEGS.          |
      | Triceratops   | TRICERATOPS HAD THREE HORNS AND A BONY FRILL. |
      | Stegosaurus   | STEGOSAURUS HAD LARGE PLATES ALONG ITS BACK.  |

  # Spoken facts depend on LAB-275; visual facts are part of the skeleton MVP.
  @read-aloud
  Scenario: Read-aloud speaks the revealed fact once it is available
    Given the app's read-aloud feature is available and enabled
    When I finish a skeleton
    Then its one short fact is spoken once in the chosen language
    And the visual result and reward stay usable while speech becomes ready
    And repeated completion events do not start overlapping or repeated speech
    And leaving the result stops that speech

  @read-aloud
  Scenario: Read-aloud readiness does not block the result
    Given read-aloud is enabled but not ready when I finish a skeleton
    Then the visual result, fact and reward appear without waiting for speech
    When read-aloud becomes ready
    Then the displayed fact is spoken exactly once

  Scenario: A fact remains available without speech
    Given read-aloud is unavailable, disabled or unable to play
    When I finish a skeleton
    Then the short fact is still shown in capitals beside the dinosaur picture
    And I can collect the reward and continue without waiting for audio
