# Draft: decisions marked (proposed) are open for review.
# Build order: the quiz (English only), then language, then dark theme.

@next
Feature: English and Russian
  Interface text, dinosaur names and units appear in the chosen language.

  Background:
    Given the app is open on an iPad in landscape

  Scenario: The app starts in the device language (proposed)
    Given the device language is Russian
    When I open the app for the first time
    Then the app is in Russian

  Scenario: Choosing a language is remembered (proposed)
    Given the app is in English
    When I switch the language to Russian on the home page
    Then all text, dinosaur names and units are in Russian
    And the app opens in Russian next time

  Scenario Outline: Values are written in the chosen language
    Given the app is in <language>
    When Triceratops's mass of 6500 kg is revealed
    Then it reads "<mass>"

    Examples:
      | language | mass  |
      | English  | 6.5 t |
      | Russian  | 6,5 т |
