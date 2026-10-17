@next
Feature: Dinosaur care: keeping progress
  Friends and care scores are kept on this browser, best effort, and
  never disturb the other games or the settings.

  Background:
    Given an iPad in landscape

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
