Feature: Skeleton home hero sizes, offline use and asset
  The animated skeleton in the SKELETONS / СКЕЛЕТЫ home hero, across
  window sizes, offline, and as a shipped asset.

  Scenario: Turning the device
    Given the skeleton hero is ready
    When the window changes size or orientation
    Then the same renderer redraws at the new size when visible, or on returning to view
    And its retained phase stays still while reduced motion is enabled
    And the hero never stretches or replays its entrance

  Scenario: The installed skeleton works offline
    Given the released app has cached all its files
    When Home features SKELETONS / СКЕЛЕТЫ with no network
    Then the locally cached renderer and GLB render the skeleton
    And it turns when visible with reduced motion off

  Scenario: The model is a small self-contained asset
    Then the shipped GLB has no external resource references and is smaller than two megabytes

  Scenario Outline: Representative supported layouts
    Given SKELETONS / СКЕЛЕТЫ is featured
    When it is shown at <width> by <height> at any age level
    Then the whole skeleton fits inside the existing hero space at every angle of its motion
    And the title, PLAY, saved progress if present and top menus are in the first viewport
    And home tiles remain reachable by scrolling

    Examples:
      | width | height |
      | 1180  | 820    |
      | 1133  | 744    |
      | 744   | 1133   |
      | 852   | 393    |
      | 667   | 375    |
      | 393   | 852    |
      | 320   | 568    |
      | 1440  | 900    |
      | 1920  | 1080   |
