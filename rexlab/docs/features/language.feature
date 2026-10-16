# Build order: the quiz (English only), then language, then dark theme.

@next
Feature: English and Russian
  Interface text, dinosaur names and units appear in the chosen language.

  Background:
    Given an iPad in landscape

  Scenario Outline: The app starts in the device language
    Given no language has been chosen in the app
    And the device language is <device>
    When I open the app
    Then the app is in <language>

    Examples:
      | device | language |
      | ru-RU  | Russian  |
      | en-GB  | English  |
      | de-DE  | English  |

  Scenario: Choosing a language is remembered
    Given the app is open in English on the home page
    When I switch the language to Russian
    Then the app is in Russian
    When I close and reopen the app
    Then the app is in Russian

  Scenario Outline: Russian text
    Given the app is in Russian
    When I see the <item>
    Then it reads "<text>"

    Examples:
      | item                | text         |
      | mass prompt         | Кто тяжелее? |
      | height prompt       | Кто выше?    |
      | Next button         | Дальше       |
      | See result button   | Результат    |
      | Play again button   | Ещё раз      |
      | Home button         | Домой        |
      | name of Triceratops | ТРИЦЕРАТОПС  |

  Scenario Outline: Values are written in the chosen language
    Given the app is in <language>
    When a <attribute> of <value> is revealed
    Then it reads "<text>"

    Examples:
      | language | attribute | value   | text  |
      | English  | mass      | 15 kg   | 15 kg |
      | Russian  | mass      | 15 kg   | 15 кг |
      | English  | mass      | 6500 kg | 6.5 t |
      | Russian  | mass      | 6500 kg | 6,5 т |
      | English  | height    | 3 m     | 3 m   |
      | Russian  | height    | 3 m     | 3 м   |
