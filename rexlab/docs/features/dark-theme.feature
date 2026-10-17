# Build order: the quiz (English only), then language, then dark theme.

Feature: Dark theme
  The app is comfortable in a dark room as well as in daylight.
  The theme is System, Light or Dark; System follows the device.

  Background:
    Given an iPad in landscape

  Scenario Outline: System follows the device appearance
    Given the theme is System
    And the device appearance is <appearance>
    When I open the app
    Then every screen uses the <appearance> theme

    Examples:
      | appearance |
      | light      |
      | dark       |

  Scenario: System follows the device while the app is open
    Given the theme is System
    And the app is open in the light theme
    When the device switches to dark appearance
    Then the app switches to the dark theme without reloading

  Scenario Outline: The theme menu is for parents
    Given the app is in <language>
    When I open the home page
    Then I see a small button with the current theme's symbol in the top-right corner
    When I tap it
    Then a menu lists "<system>", "<light>" and "<dark>", each with its symbol
    And the current theme has a ✓
    When I tap outside the menu
    Then the menu closes and the theme is unchanged

    Examples:
      | language | system    | light   | dark   |
      | English  | System    | Light   | Dark   |
      | Russian  | Системная | Светлая | Тёмная |

  Scenario: A chosen theme overrides the device
    Given the device appearance is light
    When I choose the Dark theme on the home page
    Then the app uses the dark theme
    When the device switches to dark appearance and back to light
    Then the app still uses the dark theme

  Scenario: Choosing System follows the device again
    Given I chose the Dark theme
    And the device appearance is light
    When I choose the System theme
    Then the app uses the light theme

  Scenario: A chosen theme is remembered
    Given I chose the Dark theme
    When I close and reopen the app
    Then the app uses the dark theme

  Scenario Outline: Marks stay readable in both themes
    Given the app uses the <theme> theme
    When I answer a question
    Then each mark has a contrast ratio of at least 3:1 with its card

    Examples:
      | theme |
      | light |
      | dark  |
