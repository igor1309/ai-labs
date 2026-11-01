Feature: Sand writing: Home navigation
  Scenario: Open and leave the sandbox
    Given COMPARE is featured
    And I am on Home in English or Russian
    Then I can find a sand-writing tile with a drawing symbol and uppercase name
    And its picture is a 2, an A and a circle written in the same sand as the canvas, in either theme
    And it follows CARE so the existing columns keep their order
    When I open sand writing
    Then the blank full-viewport sand canvas opens in portrait or landscape
    And the screen uses the shared quick screen transition
    And reduced motion uses a short fade
    When I press its icon-only Home button
    Then Home opens and its normal layout and version footer return
    When I open sand writing again
    Then I get fresh sand with the default fine tip
