Feature: A double tap counts as one tap
  A child of 5–7 often taps twice. One filter at the app's root swallows
  the second tap of a double tap, so it never presses anything a second
  time, nor what appears under it next (docs/tap-safety.md). It goes by
  time and place, from each press's own time: a press less than 500 ms
  after the release of the tap before it, and less than 100 CSS pixels
  from it in a straight line, is a second tap, and the filter swallows
  its whole touch: press, moves, release and tap. It knows nothing of
  screens, and holds alike for a finger, a pen or a mouse.

  A tap never moved more than 8 CSS pixels from its press, as a sort
  card's drag begins after 8. A drag the filter lets through is not a
  tap, so the press after it is never a second tap. A swallowed touch, a
  drag or not, keeps the window open from its own release, so a burst
  counts once. A cancelled touch, as when the browser scrolls, opens no
  window and closes an open one; a swallowed touch can still scroll the
  page. Keys are not filtered.

  Accepted costs:
  - two controls closer than 100 CSS pixels, tapped within 500 ms, count once;
  - a sort card re-tapped within 500 ms stays picked up;
  - a card or bone piece tapped and pressed again on its spot at once does not move.

  Background:
    Given an iPad in landscape

  Scenario: The second tap presses nothing on the screen that appears next
    When I tap "MUSEUM" on the home page
    And 200 ms after its release I tap the same spot, where the museum's "BUILD ANOTHER" button now is
    Then I see the museum hall
    And the second tap pressed nothing on the museum screen
    And one tap on "HOME" brings me back to the home page

  Scenario: A control that stays on screen goes on once
    Given I am on Tyrannosaurus's page in the catalogue, the pictures either side ready
    When I tap the → button and tap it again 200 ms after its release
    Then the next dinosaur's page is shown, and only that one

  Scenario: A quick burst of taps counts once
    Given I am on Tyrannosaurus's page in the catalogue, the pictures either side ready
    When I tap the → button three times on the same spot, each 250 ms after the release before it
    Then the next dinosaur's page is shown, and only that one

  Scenario Outline: A second tap is near in both time and place
    Given a sorting board is shown
    When I tap a dinosaur card in the tray, picking it up
    And <later> ms after its release I tap the same card again, <away> CSS pixels from where I released it
    Then the card is <state>

    Examples:
      | later | away | state                 |
      | 499   | 0    | still picked up       |
      | 500   | 0    | put down              |
      | 200   | 99   | still picked up       |
      | 200   | 100  | put down              |

  Scenario: Taps far apart both count
    Given find the pair's board is dealt
    When I tap one face-down card and, 200 ms after its release, a face-down card more than 100 CSS pixels away
    Then both cards are turned over

  Scenario: A press after a drag is not a second tap
    Given a sorting board is shown
    When I drag a dinosaur card 40 CSS pixels away and back, and let go over its own place in the tray
    And 100 ms after letting go I tap the same card on that spot
    Then the card shows it is picked up

  Scenario: A swallowed drag keeps the window open
    Given a sorting board is shown
    When I tap a dinosaur card, picking it up
    And 200 ms after its release I drag it 40 CSS pixels away and back
    And 200 ms after letting go I tap it again on that spot
    Then the card is still picked up

  Scenario: A second press on a sort card does nothing
    Given a sorting board is shown
    When I tap a dinosaur card, picking it up
    And 200 ms after its release I press the same card again and drag it onto its right basket
    Then the card is still picked up in its place, and nothing is dropped

  Scenario: A second press on a bone piece does nothing
    Given a skeleton puzzle is shown
    When I tap a bone piece without moving it
    And 200 ms after its release I press it again and drag it onto its slot
    Then the piece has not moved and is not fitted

  Scenario: Keys are not filtered
    Given I am on Tyrannosaurus's page in the catalogue, the pictures either side ready
    When I focus the → button, press Enter, and press Enter again once the next page shows, 100 ms later
    Then the → button has taken me two dinosaurs on

  Scenario Outline: The catalogue counts one start for each opening from home
    Given the large card features ANCIENT REPTILES
    When I <open>, both before the catalogue shows
    Then once it shows, ANCIENT REPTILES has counted one more start

    Examples:
      | open                                                          |
      | focus the large card and press Enter twice                    |
      | tap the large card twice, more than 100 CSS pixels apart      |
