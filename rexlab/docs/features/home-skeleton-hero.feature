Feature: Animated skeleton in the home hero
  The featured game is titled SKELETONS / СКЕЛЕТЫ.
  Its small home tile is labelled BONES / КОСТИ.
  Hatchling, Explorer and Paleontologist share this decorative presentation.
  No child-facing wording, progress rules or navigation changes.

  Scenario: A visible featured skeleton becomes ready with motion enabled
    Given SKELETONS / СКЕЛЕТЫ is featured and reduced motion is off
    When the locally bundled T. rex GLB has rendered its first frame
    Then the current picture, shimmer or picture error look fades to the rendered skeleton using shared motion tokens
    And each Home visit assembles the approved standing skeleton from a pile of bones in about five seconds
    And after a brief hold it turns 360 degrees smoothly between seconds six and fourteen
    And it rests in its three-quarter pose without scheduling continuous rendering
    And it does not replay until the next Home visit
    And the ivory bones have visible shaded edges against the light and dark sky

  Scenario Outline: The featured control works in every rendering state
    Given SKELETONS / СКЕЛЕТЫ is featured with its hero <state>
    Then a tap on the artwork reaches the featured game control
    And the renderer adds no keyboard focus stop
    And PLAY, the title and artwork open the skeleton selection screen
    And a quick double tap opens that screen once without choosing a dinosaur there
    And the saved progress remains beside PLAY

    Examples:
      | state                        |
      | loading                      |
      | rendered with motion enabled |
      | showing the fallback         |
      | frozen by reduced motion     |

  Scenario: Another game is featured
    Given another game is featured
    Then the BONES / КОСТИ tile keeps its existing picture
    And the featured game keeps its existing artwork
    And the page itself does not load the skeleton renderer or GLB
    But the release offline cache may prefetch them independently

  Scenario: The animated asset cannot be shown
    Given SKELETONS / СКЕЛЕТЫ is featured
    When loading the GLB fails or WebGL is unavailable or lost
    Then the approved standing skeleton Picture remains available with its normal loading and error states
    And that fallback fades in using the shared motion tokens
    And an error or lost context keeps the fallback for the rest of this Home visit
    And returning from the background after context loss keeps the fallback
    And the next Home visit tries the renderer again

  Scenario: Home opens with reduced motion already enabled
    Given the device requests reduced motion before Home opens
    When the visible featured skeleton finishes loading
    Then it shows the completed standing pose without continuous rendering
    And the current picture state changes to that pose with the shared short fade

  Scenario: Reduced motion changes while Home is open
    Given the skeleton hero is ready
    When the device requests reduced motion
    Then it shows the completed standing pose without continuous rendering
    When the device stops requesting reduced motion
    Then the completed pose remains still for the rest of this Home visit
    And any cross-fade to the renderer or fade to the picture uses the shared short fade while reduced motion is requested

  Scenario: Loading and rendering follow visibility
    Given SKELETONS / СКЕЛЕТЫ is featured
    Then the page does not start loading the renderer or GLB while hidden or outside the viewport
    When both the page is visible and the hero is in the viewport
    Then the page starts loading its renderer and GLB
    When the hero leaves view during loading
    Then loading can finish but the first rendered frame and fade wait until it is visible again
    When a rendered hero leaves view or the page is hidden
    Then continuous rendering pauses and retains its phase
    When both visibility conditions hold again
    Then turning resumes from its retained phase only if reduced motion is off and the renderer is healthy

  Scenario: Leaving Home
    Given the skeleton hero is loading, running, paused or frozen
    When the hero is unmounted
    Then its loading is cancelled, rendering and listeners stop and its GPU resources are released
    And a late load completion releases its resources without appearing
    And returning Home starts a new assembly animation unless reduced motion is enabled and fades to the new renderer when ready

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
