@next
Feature: Skeleton assembly: revealing and rewarding a dinosaur
  Finishing a skeleton reveals the dinosaur and one short anatomy fact.
  The collection score is one permanent star per different skeleton,
  up to three. Rebuilding an earned skeleton keeps its star.

  Background:
    Given an iPad in landscape

  Scenario: The final bone reveals the dinosaur
    Given three of the four pieces are fitted
    When I fit the last piece
    Then I briefly see the complete skeleton
    And the dinosaur's body picture fades in aligned over its skeleton
    And I see its name in large capital letters and one short anatomy fact
    And I see a star reward and my collection score out of 3
    And I see "BUILD ANOTHER", "MUSEUM" and "HOME", each with its symbol

  Scenario: The first skeleton earns a star and celebrates the first best
    Given I have never finished a skeleton
    When I finish Tyrannosaurus
    Then one star is earned for Tyrannosaurus
    And my collection score and skeleton best score become "1/3"
    And I see a first best score celebration
    And the Tyrannosaurus skeleton is added to its museum stand

  Scenario: A different skeleton increases the collection best
    Given I have earned a Tyrannosaurus star and my skeleton best score is "1/3"
    When I finish Triceratops for the first time
    Then I have one star for each of those two dinosaurs
    And my collection score and skeleton best score become "2/3"
    And I see a new best score celebration

  Scenario: Finishing all three fills the museum
    Given Tyrannosaurus and Triceratops are displayed on their earned stands
    When I finish Stegosaurus for the first time
    Then I see a collection score and skeleton best score of "3/3"
    And all three museum stands have their skeletons and earned stars
    And I can still rebuild any of them

  Scenario: Completion is recorded once before the reveal animation
    Given three pieces are fitted and this dinosaur has no earned star
    When I fit the last piece and it receives repeated release events
    Then its earned star and completed museum stand are recorded exactly once before the reveal starts
    And leaving or reloading during the reveal keeps the reward and completed stand
    And no hint appears after completion

  Scenario: A missing body picture does not block the reward
    Given a dinosaur's body picture cannot load
    When I finish its skeleton
    Then I see the completed skeleton, its name, fact and reward
    And the result appears without waiting more than one second for the missing picture
    And I can open the museum or build another dinosaur

  Scenario Outline: Each reveal presents one short anatomy fact
    Given I finish <dinosaur>
    Then I see exactly one fact: "<fact>"
    And the fact is one short sentence in capitals beside the dinosaur picture

    Examples:
      | dinosaur      | fact                                           |
      | Tyrannosaurus | T. REX HAD TINY ARMS BUT HUGE LEGS.          |
      | Triceratops   | TRICERATOPS HAD THREE HORNS AND A BONY FRILL. |
      | Stegosaurus   | STEGOSAURUS HAD LARGE PLATES ALONG ITS BACK.  |

  Scenario: Build another returns to dinosaur selection
    Given I am on a skeleton result screen
    When I tap "BUILD ANOTHER" twice quickly
    Then I see one dinosaur selection screen with all three choices
    And the completed dinosaur is marked with its earned star
    And its museum stand stays complete until I choose to rebuild it

  Scenario: Skeleton changes and rewards move smoothly
    When I open a puzzle, snap or return a bone, reveal a dinosaur, earn a star or open the museum
    Then the change animates with the app's shared motion timings
    And controls remain usable after the short transition

  Scenario: Reduced motion preserves all actions and rewards
    Given the device asks for reduced motion
    When I fit bones, receive a hint, finish a skeleton and rebuild it from the museum
    Then hints use a steady highlight rather than a pulse
    And snapping, returning, revealing, celebrating, scattering and screen changes use short fades
    And I can continue without waiting for a long animation
    And the same placement, help and reward rules apply

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
