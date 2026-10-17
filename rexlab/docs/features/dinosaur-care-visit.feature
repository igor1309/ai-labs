@next
Feature: Dinosaur care: giving items and leaving a visit
  Items are given with one tap. Leaving, reloading or turning the iPad
  never finishes a visit or changes it.

  Background:
    Given an iPad in landscape

  Scenario: Every care item can be given with one tap
    Given a visit is in progress
    Then I see plants, meat, water, a bath and a nest as large picture buttons
    And each button has a short label beside its picture
    And each button's touch target is at least 48 by 48 CSS pixels
    When I press an item button
    Then it shows a pressed state
    When I release the tap on that button
    Then I give that item to the dinosaur without having to drag it

  Scenario: A cancelled touch does not give an item
    Given a visit is in progress
    When I press an item, move my finger off it and release
    Then no item is given
    And the need, hearts and first-choice opportunity are unchanged

  Scenario: Home leaves a visit without confirmation
    Given I am partway through a visit
    When I tap "HOME"
    Then I am on the home page without being asked to confirm
    And that unfinished visit earns no saved score or new friend
    When I open care and ask for a new visitor
    Then a fresh visit starts with 0 hearts

  Scenario: Reloading discards an unfinished visit
    Given I am partway through a visit
    When I reload the app and open care
    Then I see the care welcome screen
    And no unfinished visit is resumed or counted as finished

  Scenario: Portrait pauses interaction without changing the visit
    Given I am partway through a visit
    When I turn the iPad to portrait
    Then I see a picture asking me to turn the iPad sideways
    And I cannot give an item behind that picture
    When I turn the iPad back to landscape
    Then I return to the same dinosaur, need and hearts
    And the first-choice opportunity for that need is unchanged
