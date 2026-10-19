Feature: Skeleton assembly: the museum and rebuilding
  The museum has one permanent stand for each MVP dinosaur. An earned
  skeleton can be knocked down and rebuilt for fun without losing its
  star or stand, and without earning a duplicate star.

  Background:
    Given an iPad in landscape

  Scenario: An empty museum shows what the child can build
    Given I have never finished a skeleton
    When I open "MUSEUM"
    Then I see a museum hall with three empty stands showing the silhouettes and names of the skeletons still to build
    And my collection score is "0/3" beside a star symbol
    And each empty stand offers building its dinosaur with a bone picture
    And I see "BUILD ANOTHER" and "HOME" with their symbols

  Scenario: A finished skeleton has its own exhibit
    Given I have finished Triceratops but neither of the other skeletons
    When I open "MUSEUM"
    Then the Triceratops skeleton is on its stand with its name and earned star
    And it has a "REBUILD" button with a rebuild symbol
    And the other two stands still show their unearned silhouettes
    And my collection score is "1/3"

  Scenario: An empty stand starts that dinosaur's puzzle
    Given the Stegosaurus stand is unearned
    When I tap its build control in the museum
    Then a fresh Stegosaurus puzzle starts with four unplaced pieces
    And my stars and other stands are unchanged

  Scenario: Rebuild scatters an earned skeleton and starts from scratch
    Given Triceratops is displayed on its earned stand
    And a separate unfinished Tyrannosaurus puzzle has two pieces fitted
    When I open the museum and tap Triceratops "REBUILD"
    Then the Triceratops bones scatter playfully
    And a Triceratops puzzle starts with all four pieces in the tray
    And the faint full outline has no fitted pieces
    And the unfinished Tyrannosaurus puzzle is discarded without a star or stand change
    And reopening the skeleton game later starts at dinosaur selection, not in that Tyrannosaurus puzzle
    And the Triceratops star and ownership of its stand stay earned
    And I see no loss message, score decrease or confirmation dialog

  Scenario: A quick double tap rebuilds only once
    Given Tyrannosaurus is displayed on its earned stand
    When I tap its "REBUILD" button twice quickly
    Then one scatter and one fresh Tyrannosaurus puzzle start at once, whatever its pictures are doing
    And it is counted as one puzzle started
    And its star and stand stay earned exactly once

  Scenario: Two stands tapped at the same moment start one puzzle
    Given Tyrannosaurus is displayed on its earned stand and Stegosaurus's stand is empty
    When I tap Tyrannosaurus's "REBUILD" and, in the same moment, Stegosaurus's "BUILD"
    Then one fresh Tyrannosaurus puzzle starts at once, counted as one puzzle started
    And only Tyrannosaurus's stand changes, as a stand awaiting rebuilding

  Scenario: A stand awaiting rebuilding keeps its earned identity
    Given I have started rebuilding Triceratops but have not finished it
    When I open the museum
    Then its stand shows its silhouette and earned star with a picture inviting me to continue rebuilding
    And it is distinguishable from a stand I have never earned
    And the Triceratops skeleton is absent from the stand until I finish rebuilding it
    And all other exhibits and my collection best score are unchanged
    When I choose the Triceratops stand again
    Then a fresh Triceratops puzzle starts with all four pieces unplaced

  Scenario: Completing a rebuild restores the exhibit without another star
    Given my collection score and skeleton best score are "2/3"
    And Triceratops is an earned skeleton awaiting rebuilding
    When I finish rebuilding Triceratops
    Then I see its dinosaur reveal, short fact and existing earned star
    And the Triceratops skeleton returns to the same museum stand
    And my collection score and skeleton best score stay "2/3"
    And I see no new best score celebration or duplicate star
