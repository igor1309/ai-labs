# Draft: decisions marked (proposed) are open for review.
# Build order: the quiz (English only), then language, then dark theme.

@next
Feature: Dark theme
  The app is comfortable to look at in a dark room as well as in daylight.

  Background:
    Given the app is open on an iPad in landscape

  Scenario: The app follows the device appearance
    Given the device appearance is dark
    When I open the app
    Then every screen uses the dark theme

  Scenario: The theme follows the device while the app is open
    Given the app is open in the light theme
    When the device switches to dark appearance
    Then the app switches to the dark theme without reloading

  Scenario Outline: Answer marks stay readable in both themes
    Given the app is in the <theme> theme
    When I answer a question
    Then the correct and wrong marks contrast clearly with their cards

    Examples:
      | theme |
      | light |
      | dark  |

  Scenario: Choosing a theme is remembered (proposed)
    Given the device appearance is light
    When I choose the dark theme on the home page
    Then the app uses the dark theme
    And the app opens in the dark theme next time
