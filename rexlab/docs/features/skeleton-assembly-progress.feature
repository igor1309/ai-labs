Feature: Skeleton assembly: keeping the collection
  Earned stars and museum stand states are kept on this browser, best
  effort. An unfinished rebuild keeps only its earned identity and
  awaiting-rebuild state; fitted bone placements are not saved. Leaving
  a puzzle never awards a star or removes a previously earned star or stand.
  The child's choice on the level switch is kept beside them
  (skeleton-assembly-levels.feature).

  Background:
    Given an iPad in landscape

  Scenario: Earned stars and completed exhibits survive reopening
    Given I have finished Tyrannosaurus and Triceratops
    When I close and reopen the app and visit the museum
    Then my collection score and skeleton best score are "2/3"
    And those two skeletons are on their earned stands
    And the Stegosaurus stand still has an unearned silhouette

  Scenario Outline: Leaving an unfinished first build earns nothing
    Given Tyrannosaurus is displayed on its earned stand
    And I have fitted three Triceratops pieces for the first time
    When I <leave>
    And I reopen the skeleton game
    Then I see the dinosaur selection screen
    And my collection score and skeleton best score are still "1/3"
    And Tyrannosaurus is still displayed and the Triceratops stand is unearned
    When I choose Triceratops
    Then all four pieces are in the tray and none are fitted

    Examples:
      | leave          |
      | tap "HOME"     |
      | reload the app |

  Scenario: Home leaves a puzzle without confirmation
    Given a skeleton puzzle is unfinished
    When I tap "HOME"
    Then I see the home page without being asked to confirm
    And the unfinished puzzle is not counted as complete

  Scenario: An unfinished rebuild survives as an earned stand awaiting rebuilding
    Given I have earned the Triceratops star and started rebuilding it
    And I have fitted two of its pieces
    When I close and reopen the app and visit the museum
    Then the Triceratops stand still shows its earned star and a rebuilding invitation
    And its skeleton is absent and my collection best score has not decreased
    And none of its fitted bone positions are restored
    When I choose its stand
    Then a fresh Triceratops puzzle starts with four unplaced pieces
    When I finish that puzzle
    Then the skeleton returns to its stand without earning another star

  Scenario: Skeleton saves preserve other progress and settings
    Given I have saved quiz scores, care friends and scores, language and theme choices
    When I finish a skeleton, start rebuilding it and reopen the app
    Then all those other scores, friends and settings are unchanged
    And saving progress in another game also preserves my skeleton stars and stand states

  Scenario Outline: Unusable skeleton progress starts an empty museum
    Given stored skeleton progress is <state>
    When I open the skeleton game
    Then I have no earned skeleton stars or skeleton best score
    And all three museum stands have unearned silhouettes
    When I finish a skeleton
    Then its first star, completed stand and first best score are saved in readable skeleton progress
    And readable progress for other games is preserved

    Examples:
      | state                          |
      | absent                         |
      | malformed                      |
      | from an unknown schema version |

  Scenario: Duplicate or unknown saved dinosaurs cannot inflate the collection
    Given readable saved skeleton progress repeats Tyrannosaurus and includes an unknown dinosaur
    When I open the museum
    Then Tyrannosaurus has only one stand and one earned star
    And the unknown dinosaur has no stand or star
    And the collection score and skeleton best score count only different earned MVP dinosaurs

  Scenario: A browser that cannot read progress still allows play
    Given the browser cannot read stored skeleton progress
    When I finish Triceratops
    Then I see its reveal and star reward and can visit its completed museum stand
    And that earned star is kept while the app remains open
    And I see no historical best score or best score celebration

  Scenario: A browser that cannot save progress keeps it for the session
    Given my saved collection has one star and a best score of "1/3"
    And the browser can read progress but cannot save it
    When I finish a different skeleton
    Then I see two earned stars, two completed exhibits and a new best score celebration of "2/3"
    And rebuilding either skeleton in this session cannot earn a duplicate star
    But after reloading only the previously saved collection can be restored
