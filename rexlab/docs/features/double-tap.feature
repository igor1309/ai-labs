Feature: A double tap counts as one tap
  A child of 5–7 often taps twice. One filter at the app's root swallows
  the second tap of a double tap, wherever it lands, so it never presses
  anything a second time and never presses anything on the screen that
  appears next (docs/tap-safety.md). It goes by time and place only,
  from each touch's own time: a press less than 500 ms after the release
  of the tap before it, and less than 100 CSS pixels from where that tap
  was released, is a second tap. The filter swallows its whole touch:
  press, moves, release and the tap it would make. It knows nothing of
  screens, so it holds on every screen alike.

  A tap counts as a tap only if the finger moved no more than 8 CSS
  pixels between press and release, as a sort card's drag begins after
  8. A drag is not a tap, and the press after it is never a second tap.
  A swallowed press keeps the window open from its own release, so a
  quick burst of taps on one spot counts once. Keys are not filtered: a
  key press is never a child's accidental second tap.

  Accepted costs: two controls closer than 100 CSS pixels, tapped within
  500 ms, count once; and a sort card tapped to pick it up, then dragged
  again from the same spot at once, does not move until pressed again.

  Background:
    Given an iPad in landscape

  Scenario: The second tap presses nothing on the screen that appears next
    When I tap "MUSEUM" on the home page
    And 200 ms later I tap the same spot, where the museum's "BUILD ANOTHER" button now is
    Then I see the museum hall
    And the second tap pressed nothing on the museum screen
    And one tap on "HOME" brings me back to the home page

  Scenario: A control that stays on screen goes on once
    Given I am on Tyrannosaurus's page in the catalogue
    When I tap the → button and tap it again 200 ms later
    Then the next dinosaur's page is shown, and only that one

  Scenario: A quick burst of taps counts once
    Given I am on Tyrannosaurus's page in the catalogue
    When I tap the → button three times at the same spot, 300 ms apart
    Then the next dinosaur's page is shown, and only that one

  Scenario Outline: A second tap is near in both time and place
    Given I am on Tyrannosaurus's page in the catalogue
    When I tap the → button and press again <later> ms after its release, <away> CSS pixels from where it was released, on the → button
    Then the → button has taken me <steps>

    Examples:
      | later | away | steps                     |
      | 499   | 0    | one dinosaur on           |
      | 500   | 0    | two dinosaurs on          |
      | 200   | 99   | one dinosaur on           |
      | 200   | 100  | two dinosaurs on          |

  Scenario: Taps far apart both count
    Given find the pair's board is dealt
    When I tap one face-down card and, 200 ms later, a face-down card more than 100 CSS pixels away
    Then both cards are turned over

  Scenario: A press after a drag is not a second tap
    Given a sorting board is shown
    When I drag a dinosaur card onto its right basket
    And 100 ms after letting go I tap another card at the spot where I let go
    Then the other card shows it is picked up

  Scenario: A second press on a sort card does nothing
    Given a sorting board is shown
    When I tap a dinosaur card
    And 200 ms after its release I press the same card again and drag it onto a basket
    Then the card stays picked up where it was, and nothing is dropped

  Scenario: A second press on a bone piece does nothing
    Given a skeleton puzzle is shown
    When I tap a bone piece without moving it
    And 200 ms after its release I press it again and drag it onto its slot
    Then the piece has not moved and is not fitted

  Scenario: Keys are not filtered
    Given I am on Tyrannosaurus's page in the catalogue
    When I focus the → button and press Enter twice, 100 ms apart
    Then the → button has taken me two dinosaurs on

  Scenario Outline: The catalogue counts one start for each opening from home
    Given the large card features ALL DINOSAURS
    When I <open>
    Then I see the catalogue
    And ALL DINOSAURS counts one more start

    Examples:
      | open                                                                                        |
      | tap the ALL DINOSAURS tile twice quickly                                                    |
      | focus the ALL DINOSAURS tile and press Enter twice, 100 ms apart                            |
      | tap the ALL DINOSAURS tile and, 200 ms later, the large card, more than 100 CSS pixels away |
