# Build order: the quiz (English only), then language, then dark theme.

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

  Scenario: The language switch is for parents
    When I open the home page
    Then the language switch is a small "EN | RU" control in a corner

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
      | item                | text              |
      | quiz card           | СРАВНИ            |
      | mass prompt         | КТО ТЯЖЕЛЕЕ?      |
      | height prompt       | КТО ВЫШЕ?         |
      | Next button         | ДАЛЬШЕ            |
      | See result button   | РЕЗУЛЬТАТ         |
      | Play again button   | ЕЩЁ РАЗ           |
      | Home button         | ДОМОЙ             |
      | name of Triceratops | ТРИЦЕРАТОПС       |

  Scenario Outline: Values are written in the chosen language
    Given the app is in <language>
    When a <attribute> of <value> is revealed
    Then it reads "<text>"

    Examples:
      | language | attribute | value   | text  |
      | English  | mass      | 15 kg   | 15 KG |
      | Russian  | mass      | 15 kg   | 15 КГ |
      | Russian  | mass      | 1000 kg | 1 Т   |
      | English  | mass      | 6500 kg | 6.5 T |
      | Russian  | mass      | 6500 kg | 6,5 Т |
      | English  | height    | 3 m     | 3 M   |
      | Russian  | height    | 3 m     | 3 М   |

  Scenario Outline: Text for children is in capitals
    Given the app is in <language>
    When I play a round through to the result
    Then every text on every screen is in capitals
    But the language switch and the version footer, which are for parents, are not

    Examples:
      | language |
      | English  |
      | Russian  |
