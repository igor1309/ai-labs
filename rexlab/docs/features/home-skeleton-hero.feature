Feature: Animated skeleton in the home hero
  The BONES / КОСТИ featured game has a gently moving dinosaur skeleton.
  The presentation is the same for Hatchling, Explorer and Paleontologist.
  No new child-facing words are introduced.

  Scenario: BONES is today's featured game
    Given the home page features BONES / КОСТИ
    When its local skeleton GLB is ready and WebGL is available
    Then a warm ivory skeleton gently turns in the existing hero space
    And the small game tiles keep their existing pictures
    And the hero artwork does not intercept taps
    And the featured game opens as before

  Scenario: The animated asset cannot be shown
    Given the home page features BONES / КОСТИ
    When the GLB is loading, fails to load, or WebGL is unavailable or lost
    Then the existing skeleton picture occupies the hero space
    And navigation and progress remain available

  Scenario: Reduced motion
    Given the device requests reduced motion
    When the skeleton hero is ready
    Then it shows a static pose without continuous animation

  Scenario: The hero is hidden or left
    Given the skeleton hero is running
    When the page is hidden or the hero is outside the viewport
    Then continuous rendering pauses
    When the hero is unmounted
    Then its rendering and listeners stop and its GPU resources are released

  Scenario Outline: The skeleton fits every supported layout
    Given the home page features BONES / КОСТИ
    When it is shown on <layout> at any age level
    Then the whole skeleton fits inside the existing hero space
    And the title, progress and navigation remain visible

    Examples:
      | layout           |
      | iPad landscape   |
      | iPad portrait    |
      | iPhone landscape |
      | iPhone portrait  |
      | Mac              |
