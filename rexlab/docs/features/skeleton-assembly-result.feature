Feature: Skeleton assembly: revealing and rewarding a dinosaur
  Finishing a skeleton reveals the dinosaur and one short anatomy fact.
  The collection score is one permanent star per different skeleton,
  up to three. Rebuilding an earned skeleton keeps its star.

  Background:
    Given an iPad in landscape
    And the level switch shows Hatchling chosen, whose four pieces these scenarios count

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

  Scenario Outline: The result waits for neither of its pictures
    Given a dinosaur's skeleton picture <skeleton> and its body picture <body>
    When I finish its skeleton
    Then the result appears once the complete skeleton has held, waiting for no picture
    And I see its name, fact and reward, and can open the museum or build another dinosaur
    And the skeleton's place shows <shows>, as pictures.feature has it
    And the body picture adds no shimmer and no failure look of its own
    And a body picture that failed before is loaded again, as any new place loads it
    And <then>

    Examples:
      | skeleton         | body             | shows                                           | then                                                                         |
      | has loaded       | cannot load      | the whole skeleton                              | it stays whole                                                               |
      | has loaded       | is still loading | the whole skeleton                              | once the body loads, it fades in over the skeleton as the skeleton fades back |
      | is still loading | has loaded       | its shimmer, faded back under the body          | once the skeleton picture loads, it fades in, faded back under the body      |
      | is still loading | cannot load      | its shimmer                                     | once the skeleton picture loads, it fades in whole                           |
      | is still loading | is still loading | its shimmer                                     | each picture, once loaded or failed, shows as in the rows above              |
      | cannot load      | has loaded       | the failure look, faded back under the body     | it stays so                                                                  |
      | cannot load      | is still loading | the failure look                                | once the body loads, it fades in over the failure look as that fades back    |
      | cannot load      | cannot load      | the failure look                                | it stays so, the reward still shown                                          |

  Scenario Outline: A body picture fades in as the reveal does, however late it loads
    Given the device <asks> reduced motion
    When the result shows a body picture, as it appears or once the picture loads
    Then from then the body waits one --motion-screen, then fades in over two, as the skeleton fades back
    And --motion-screen is <screen>

    Examples:
      | asks         | screen |
      | does not ask | 320 ms |
      | asks for     | 160 ms |

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
