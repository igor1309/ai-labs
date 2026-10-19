Feature: Skeleton assembly: help in steps
  Explorer and Paleontologist help in steps rather than with Hatchling's
  one glow (skeleton-assembly-help.feature, docs/skeleton-levels.md).
  Every ten seconds at the puzzle without fitting a piece, help climbs a
  step for the first piece left in the tray: its body region on the
  outline, then a faint ghost of it at its home, last the piece itself
  moving towards its home and back. Each step adds to the ones before,
  and the piece's spot in the tray glows from the first step. Help never
  fits a piece; a piece fitted starts the steps again from the first.
  Time counts as Hatchling's does: only at the puzzle, and a drop that
  misses never puts help off.

  Background:
    Given an iPad in landscape
    And the level switch shows Explorer chosen
    And I am building Tyrannosaurus, no piece fitted

  Scenario: The first step shows the body region
    When 9 seconds pass
    Then no help shows yet
    When another second passes
    Then the skull's spot in the tray glows
    And the head's region on the outline glows softly, around every slot of the head
    And no slot glows on its own, and no piece is fitted for me

  Scenario: The second step shows a faint ghost at its home
    When 20 seconds pass
    Then the head's region still glows and the skull's spot still glows
    And a faint picture of the skull shows in its slot
    And the ghost cannot be picked up, and the slot is still empty

  Scenario: The last step moves the piece towards its home and back
    When 30 seconds pass
    Then the skull in the tray moves part of the way towards its home and back, once
    And it ends in its spot, still unfitted
    And the region, the ghost and the spot's glow still show

  Scenario: Under reduced motion the last step fades instead
    Given the device asks for reduced motion
    When 30 seconds pass
    Then the skull fades out and back in its spot, without moving

  Scenario: A piece fitted starts the steps again
    Given 30 seconds have passed and every step shows
    When I fit the neck
    Then all help clears
    And after 10 more seconds the skull's region and spot glow, the first step again

  Scenario: The next piece is helped once the helped one fits
    Given 20 seconds have passed and the skull's ghost shows
    When I fit the skull
    Then after 10 more seconds the neck's region and spot glow

  Scenario: Help shown as I pick a piece up waits until I let it go
    Given 19 seconds have passed
    When I hold the tail for 2 seconds
    Then the ghost does not show under my finger
    When I let the tail go beside the board
    Then the skull's ghost shows

  Scenario: Paleontologist helps in the same steps
    Given the level switch shows Paleontologist chosen
    When I tap Triceratops and 10 seconds pass
    Then the skull's spot and the head's region glow, as Explorer's first step

  Scenario: Hatchling keeps its one glow
    Given the level switch shows Hatchling chosen
    When I tap Triceratops and 30 seconds pass
    Then only the skull's slot and spot glow, as skeleton-assembly-help.feature says
