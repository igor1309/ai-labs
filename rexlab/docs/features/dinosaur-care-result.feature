@next
Feature: Dinosaur care: results, best scores and friends
  A finished visit earns 4 to 8 hearts and befriends its dinosaur.
  The child can welcome another visitor or call a friend back.
  Friends and care scores are kept on this browser, best effort.

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

  Scenario: Finishing a first visit makes a dinosaur a friend
    Given Tyrannosaurus is not yet my friend
    When I finish caring for Tyrannosaurus and open "FRIENDS"
    Then I see a tappable friend card with its picture and name
    And my friend count has increased by 1

  Scenario: A friend can be called back
    Given Tyrannosaurus is my friend
    And I am on the care welcome screen
    When I open "FRIENDS" and tap Tyrannosaurus
    Then Tyrannosaurus starts a fresh visit with 0 hearts and all four needs unmet
    And I can earn hearts and a best score on that visit
    When I finish the visit
    Then my completed care visit count increases by 1
    And Tyrannosaurus still has only one card in my friends
    And my friend count has not increased

  Scenario: An empty friends screen offers a way to start
    Given I have no dinosaur friends
    When I open "FRIENDS"
    Then I see a friendly picture inviting me to welcome a dinosaur
    And "NEW VISITOR" with a dinosaur symbol and "BACK" with an arrow symbol
    When I tap "BACK"
    Then I return to the care welcome screen

  Scenario: Friends remain usable as the collection grows
    Given all 30 dinosaurs are my friends
    When I open "FRIENDS"
    Then I can scroll to and tap every friend card
    And each dinosaur appears once, in the shared dinosaur list's order
    And I see "NEW VISITOR", "BACK" and "HOME" with their symbols

  Scenario: Going home from a result keeps the completed visit
    Given I am on a care result screen
    When I tap "HOME" and reopen care
    Then I see the care welcome screen
    And the completed visit, its best score and its friend are kept

  Scenario: Friends and care progress survive reopening the app
    Given I have finished 3 care visits, my care best score is 7 and Triceratops is my friend
    When I close and reopen the app
    Then care still counts 3 completed visits and a best score of 7
    And I can call Triceratops back from "FRIENDS"

  Scenario: Leaving an unfinished visit keeps previous progress
    Given I have finished 3 care visits, my care best score is 7 and Triceratops is my friend
    And I have earned 4 hearts in an unfinished visit from Tyrannosaurus
    When I leave that visit or reload the app
    Then care still counts 3 completed visits and a best score of 7
    And Triceratops is still my friend but Tyrannosaurus has not been added

  Scenario: Care saves leave other games and app settings alone
    Given I have stored quiz scores, language and theme choices
    When I finish a care visit and reopen the app
    Then my quiz scores, language and theme choices are unchanged
    And saving quiz progress also keeps my care scores and friends

  Scenario Outline: Unusable care progress starts a fresh collection
    Given the stored care progress is <state>
    When I open care
    Then I have no care best score, no completed care visits and no friends
    When I finish a visit with 6 hearts
    Then I see a first best score celebration
    And that visit, its best score and its friend are saved in readable care progress
    And readable progress for other games is preserved

    Examples:
      | state                          |
      | absent                         |
      | malformed                      |
      | from an unknown schema version |

  Scenario: Removed dinosaurs do not leave broken friend cards
    Given my saved friends include an id absent from the current dinosaur list
    When I open "FRIENDS"
    Then I see cards and a friend count only for dinosaurs still in the list
    And my care score and completed visit count are unchanged

  Scenario: Care works when stored progress cannot be read
    Given the browser cannot read stored care progress
    When I finish a visit with 6 hearts
    Then I see "6/8" and the happy departure
    And I see no best score or best score celebration
    And that dinosaur is available as a friend while the app remains open

  Scenario: Care works when progress cannot be saved
    Given my care best score is 5
    And the browser can read care progress but cannot save it
    When I finish a visit with 6 hearts
    Then I see a new best score celebration and a best score of 6
    And that dinosaur is available as a friend while the app remains open
    And a later completed visit in this app session is compared against 6
    But after reloading only the previously saved progress can be restored

  Scenario Outline: Results and friends use the chosen language
    Given the app is in <language>
    When I finish a visit and open "<friends>"
    Then I see "<new visitor>", "<back>" and "<home>" with their symbols
    And dinosaur names and empty-collection guidance are in <language>
    And all text for children is in capitals

    Examples:
      | language | friends | new visitor | back  | home  |
      | English  | FRIENDS | NEW VISITOR | BACK  | HOME  |
      | Russian  | ДРУЗЬЯ  | НОВЫЙ ГОСТЬ | НАЗАД | ДОМОЙ |

  Scenario: Results, celebrations and friends respect reduced motion
    Given the device asks for reduced motion
    When I finish a visit, celebrate a best score and open "FRIENDS"
    Then departures, celebrations and screen changes use short fades
    And I can read the result and choose a friend without waiting for a dance
