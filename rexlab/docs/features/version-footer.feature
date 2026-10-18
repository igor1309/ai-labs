Feature: The version footer's name
  The version footer is for parents. Once the app has opened, a screen
  reader names it in the app's language, in normal case, on every screen
  and after every change of language.

  Background:
    Given an iPad in landscape

  Scenario Outline: The version footer is named in the app's language
    Given the app is open in <from> on the home page
    Then a screen reader names the version footer "<first>"
    When I switch the language to <to>
    And I open the "<tile>" tile
    Then a screen reader names the version footer "<then>"
    When I go back home and switch the language to <from>
    Then a screen reader names the version footer "<first>"

    Examples:
      | from    | first   | to      | tile          | then    |
      | Russian | Версия  | English | ALL DINOSAURS | Version |
      | English | Version | Russian | ВСЕ           | Версия  |
