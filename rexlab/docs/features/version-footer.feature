Feature: The version footer's name
  The version footer, for parents, is part of the static page, not the
  app. A screen reader names it in the app's language, in normal case,
  from the moment the app opens and after every change of language.

  Background:
    Given an iPad in landscape

  Scenario Outline: The version footer is named in the chosen language
    Given the app is open in <from> on the home page
    Then a screen reader names the version footer "<first>"
    When I switch the language to <to>
    Then a screen reader names the version footer "<then>"

    Examples:
      | from    | first   | to      | then    |
      | Russian | Версия  | English | Version |
      | English | Version | Russian | Версия  |
