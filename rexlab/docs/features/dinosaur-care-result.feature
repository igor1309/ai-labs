Feature: Dinosaur care: the result and the best score
  A finished visit earns 4 to 8 hearts, befriends its dinosaur and
  is compared with the best care score so far.

  Background:
    Given an iPad in landscape

  Scenario Outline: A finished visit shows the hearts earned
    Given I meet all four needs with <first choices> first-choice matches
    And I meet the other needs after retries
    When the dinosaur finishes resting
    Then it dances happily and leaves
    And I see a result of "<score>/8" beside a heart symbol
    And I see its picture and its name as a friend
    And I see "NEW VISITOR", "FRIENDS" and "HOME", each with its symbol

    Examples:
      | first choices | score |
      | 0             | 4     |
      | 2             | 6     |
      | 4             | 8     |

  Scenario: Completion is recorded once before the departure animation
    Given three needs are met
    When I meet the final need
    Then one completed visit, its score and its dinosaur friend are recorded
    And leaving or reloading during the departure cannot record it twice
    And the visit counts as finished even if I leave before the result appears

  Scenario: The first finished visit sets and celebrates the first best
    Given I have never finished a care visit
    When I finish a visit with 4 hearts
    Then I see a first best score celebration
    And my care best score becomes 4
    And my completed care visit count becomes 1

  Scenario: Beating the highest historical care score is celebrated
    Given my care best score is 6 and my last care visit earned 4 hearts
    When I finish a visit with 7 hearts
    Then I see a new best score celebration
    And my care best score becomes 7

  Scenario Outline: A tied or lower score keeps the best
    Given my care best score is 7
    When I finish a visit with <score> hearts
    Then I see the happy departure and my earned hearts
    And my care best score still reads "7/8"
    And I see no new best score celebration

    Examples:
      | score |
      | 7     |
      | 5     |

  Scenario: New visitor from the result starts a fresh visit
    Given I am on a care result screen
    When I tap "NEW VISITOR" twice quickly
    Then one new visit starts with a different dinosaur
    And its four needs are unmet and its hearts start at 0
    And my previous completed visit is counted only once

  Scenario: Going home from a result keeps the completed visit
    Given I am on a care result screen
    When I tap "HOME" and reopen care
    Then I see the care welcome screen
    And the completed visit, its best score and its friend are kept

  Scenario: Results, celebrations and friends respect reduced motion
    Given the device asks for reduced motion
    When I finish a visit, celebrate a best score and open "FRIENDS"
    Then departures, celebrations and screen changes use short fades
    And I can read the result and choose a friend without waiting for a dance
