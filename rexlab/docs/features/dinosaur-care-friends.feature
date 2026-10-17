Feature: Dinosaur care: friends
  Every dinosaur cared for to the end becomes a friend the child can
  call back for a fresh visit.

  Background:
    Given an iPad in landscape

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
    Given all 42 dinosaurs are my friends
    When I open "FRIENDS"
    Then I can scroll to and tap every friend card
    And each dinosaur appears once, in the shared dinosaur list's order
    And I see "NEW VISITOR", "BACK" and "HOME" with their symbols

  Scenario: Removed dinosaurs do not leave broken friend cards
    Given my saved friends include an id absent from the current dinosaur list
    When I open "FRIENDS"
    Then I see cards and a friend count only for dinosaurs still in the list
    And my care score and completed visit count are unchanged

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
