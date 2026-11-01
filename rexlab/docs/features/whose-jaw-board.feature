Feature: Give five jaws back to their dinosaurs
  The child reads teeth at the first two levels, then jaw shape at the hardest.
  There is no time limit and the same five jaws stay in a round until placed.

  Scenario Outline: A round deals five distinct jaws
    Given I play Whose Jaw at <level>
    When a jaw arrives
    Then I see <choices> different dinosaurs with gummy mouths
    And the jaw's owner is among them
    And the tray holds a jaw at least 160 pixels wide
    And the progress bar has five empty tooth sockets
    And no jaw repeats during the round
    Examples:
      | level          | choices |
      | Hatchling      | 2       |
      | Explorer       | 3       |
      | Paleontologist | 4       |

  Scenario: Hatchling teaches a single diet answer with pictures
    Given I play at Hatchling
    Then one choice eats meat and one eats plants
    And each dinosaur has its food beside it
    And the loose jaw's food is hidden until the hint
    And only the dinosaur of the jaw's diet accepts it

  Scenario: Explorer keeps the diet answer unambiguous
    Given I play at Explorer
    Then I see the owner and two opposite-diet distractors
    And food pictures do not give the answer away
    And only the owner has the jaw's diet

  Scenario: Shape decides Paleontologist
    Given I play at Paleontologist
    Then I see the owner and its same-diet look-alike partner
    And the other two choices form another look-alike pair
    And large capitalized dinosaur names appear below the gummy pictures
    When I give the jaw to the owner's partner
    Then it does not fit even though the diet matches
    And the dinosaur's shape cue appears with a ruler and is spoken
    When I give it to the owner
    Then its jaw fact appears with a tooth and is spoken

  Scenario: Tap to listen, then pick up and place
    Given the jaw is waiting in the tray
    When I tap a dinosaur without picking up the jaw
    Then its name is spoken in the selected language
    And no try is counted
    When I tap the jaw
    Then it lifts and glows and the dinosaur mouths invite it
    When I tap a dinosaur
    Then that choice counts as one try

  Scenario Outline: Put a picked jaw down without a try
    Given I picked up the jaw
    When I tap <place>
    Then the jaw is put down without an error or a filled tooth
    Examples:
      | place       |
      | the jaw     |
      | empty space |

  Scenario: Drag to an inviting dinosaur
    Given a waiting jaw
    When I drag it over a dinosaur
    Then it follows my pointer and that dinosaur leans in
    And the whole dinosaur plus 40 pixels is a drop zone at least 200 by 200 pixels
    When I release there
    Then that choice counts as one try

  Scenario Outline: Cancel a drag
    Given I am dragging the jaw
    When <cancellation>
    Then the jaw returns to the tray without counting a try
    Examples:
      | cancellation                   |
      | I release outside all dinosaurs |
      | the pointer is cancelled        |
      | the window loses focus          |
      | the orientation gate covers play |

  Scenario: One finger owns the drag
    Given one finger holds the jaw
    When a second finger touches or releases on a dinosaur
    Then it neither moves nor places the jaw
    And the first finger can still place it

  Scenario: Play with a keyboard
    Given a waiting jaw
    When I press Space or Enter on the jaw
    Then it is picked up
    When I use the arrows
    Then focus moves between named dinosaur buttons and wraps
    When I press Space or Enter on a dinosaur
    Then the picked jaw is placed there
    And held keys do not place a second jaw
    And Escape puts a picked jaw down

  Scenario: Correct placement earns a tooth
    When I place the jaw correctly
    Then input locks through snap, two food bites and the happy walk away
    And synthesized snap, crunch and step sounds accompany the feedback
    And one socket fills with a white tooth
    And the tooth shines if there were no wrong tries on this jaw
    And a button with a right arrow and the capitalized localized Next label appears in the tray
    And Next stays disabled until the animation settles
    And jaw placement stays locked while I read
    When I press Next
    Then the next jaw enters before input unlocks
    And after Next on the fifth jaw all teeth shine and the result destination opens

  Scenario: Correct feedback waits for the child
    Given I have placed a jaw correctly at Paleontologist
    When the snap, bites and walk away settle
    And I spend several minutes reading
    Then the same jaw fact remains visible
    And the fact is not spoken again merely because the animation settled
    And no new jaw or result appears until I press Next
    When I rapidly press Next more than once
    Then exactly one jaw is completed
    And no extra jaw is answered or skipped

  Scenario: Next supports keyboard and reduced motion
    Given correct feedback is ready to read
    Then Next can be activated with Space or Enter
    And held keys cannot repeat Next
    And reduced motion still waits for Next after its short fades
    And Next remains disabled while the orientation gate covers play

  Scenario Outline: Wrong placement is playful and repeatable
    When I give <jaw> to <dinosaur>
    Then <reaction> appears with its picture and is spoken
    And the jaw returns after the reaction without losing a tooth
    And the same choices remain for another try
    Examples:
      | jaw    | dinosaur     | reaction          |
      | meat   | plant eater  | OW! SHARP TEETH!  |
      | plants | meat eater   | HMM? FLAT TEETH!  |

  Scenario: Two errors reveal a hint
    Given I have made two wrong tries on this jaw
    Then the owner's mouth glows
    And at Hatchling the food cue is emphasized and the jaw's diet picture appears
    And the hint lasts until I place this jaw
    And the next jaw starts without a hint

  Scenario: Pictures never block play
    Given a jaw or gummy picture is loading or has failed
    Then Picture keeps its place with the shared loading or failure treatment
    And names, keyboard, dragging and tapping remain usable
    And the tray wiggle begins only once its picture is decoded and remains untouched

  Scenario: Motion and feedback follow device preferences
    Given reduced motion is requested
    Then entrances, snaps, returns and walk-offs use short fades
    And breathing and repeated tray wiggles stop
    And a wrong reaction stays for 800 milliseconds

  Scenario: Leaving cancels board work
    Given feedback is playing
    When I go home or back, or leave the app
    Then board timers and speech and sounds are stopped
    And a stopped timer delivered late cannot advance another board
    And rapid clicks during feedback cannot count or land on the next jaw
    And the shared app double-tap filter continues to guard touch navigation

  Scenario: English and Russian are complete
    When I play in either supported language
    Then prompts, reactions, hints, food labels and accessible names use that language
    And child-facing words are capitals
