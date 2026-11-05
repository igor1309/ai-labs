Feature: Animated skeleton in the home hero
  The BONES / КОСТИ featured game has a gently turning Tyrannosaurus rex skeleton.
  The presentation is the same for Hatchling, Explorer and Paleontologist.
  No new child-facing words are introduced.

  Scenario: BONES is today's featured game
    Given the home page features BONES / КОСТИ
    When its locally bundled skeleton GLB is ready and WebGL is available
    Then a warm ivory T. rex turns within 0.1 radians either side of its central pose on a ten-second cycle
    And shading makes the bones stand out against both the light and dark sky
    And the picture cross-fades to the rendered skeleton using the shared motion tokens
    And the hero artwork does not intercept pointer or keyboard input
    And PLAY, the title and artwork open the skeleton selection screen
    And a quick double tap opens that screen once without choosing a dinosaur there
    And progress and rewards remain beside PLAY

  Scenario: BONES is not featured
    Given another game is featured
    Then the small BONES tile keeps its existing picture
    And the featured game keeps its existing artwork
    And no skeleton renderer dependency or GLB is requested for the hero

  Scenario: The animated asset cannot be shown
    Given the home page features BONES / КОСТИ
    When the GLB is loading, fails to load, or WebGL is unavailable or lost
    Then the existing T. rex skeleton picture occupies the hero space
    And a rendered skeleton fades back to the picture using the shared motion tokens
    And navigation and progress remain available
    And an error or lost context keeps the picture for the rest of this Home visit
    And the next Home visit may try the renderer again

  Scenario: Reduced motion changes while Home is open
    Given the skeleton hero is ready
    When the device requests reduced motion
    Then it shows the central static pose without continuous rendering
    And artwork transitions use the shared short fade
    When the device stops requesting reduced motion
    Then turning resumes only while the page is visible and the hero is in the viewport

  Scenario: Rendering pauses and resumes
    Given the skeleton hero is running
    When the page is hidden or the hero is outside the viewport
    Then continuous rendering pauses and retains its phase
    When the page is visible and the hero is in the viewport again
    Then turning resumes from its retained phase only if reduced motion is off and the renderer is healthy

  Scenario: Leaving Home
    Given the skeleton hero is loading or running
    When the hero is unmounted
    Then its loading is cancelled, rendering and listeners stop and its GPU resources are released
    And a late load completion releases its resources without appearing
    And returning Home starts a new picture-to-renderer fade once the new renderer is ready

  Scenario: Turning the device
    Given the skeleton hero is ready
    When the window changes size or orientation
    Then the same renderer redraws at the new size with its retained phase
    And the hero never stretches or replays its entrance

  Scenario: The installed skeleton works offline
    Given the released app has cached its files
    When Home features BONES with no network
    Then its bundled GLB and renderer remain available offline
    And the GLB is self-contained and smaller than two megabytes

  Scenario Outline: The skeleton fits every supported layout
    Given the home page features BONES / КОСТИ
    When it is shown at <width> by <height> at any age level
    Then the whole skeleton fits inside the existing hero space at every angle of its motion
    And the title, progress and navigation remain visible

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
