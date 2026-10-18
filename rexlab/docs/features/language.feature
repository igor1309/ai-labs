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

  Scenario: The language menu is for parents
    When I open the home page
    Then I see a small globe button showing "EN" or "RU" in the top-right corner
    When I tap it
    Then a menu lists "English" and "Русский", each in its own language
    And the language shown has a ✓
    When I tap outside the menu
    Then the menu closes and the language is unchanged

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
      | item                | text               |
      | quiz tile           | СРАВНИ             |
      | mass prompt         | КТО ТЯЖЕЛЕЕ?       |
      | height prompt       | КТО ВЫШЕ?          |
      | Next button         | ДАЛЬШЕ             |
      | See result button   | РЕЗУЛЬТАТ          |
      | Play again button   | ЕЩЁ РАЗ            |
      | Home button         | ДОМОЙ              |
      | name of Triceratops | ТРИЦЕРАТОПС        |
      | sorting game card   | РАЗЛОЖИ            |
      | sorting prompt      | РАЗЛОЖИ ДИНОЗАВРОВ |
      | basket TWO LEGS     | ДВЕ НОГИ           |
      | basket FOUR LEGS    | ЧЕТЫРЕ НОГИ        |
      | basket PLANTS       | РАСТЕНИЯ           |
      | basket MEAT         | МЯСО               |
      | basket BIG          | БОЛЬШИЕ            |
      | basket SMALL        | МАЛЕНЬКИЕ          |
      | basket HORNS        | С РОГАМИ           |
      | basket NO HORNS     | БЕЗ РОГОВ          |
      | basket FEATHERS     | С ПЕРЬЯМИ          |
      | basket NO FEATHERS  | БЕЗ ПЕРЬЕВ         |

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
    When I play a round of <game> through to the result
    Then every text on every screen is in capitals
    But the parents' menus and the version footer, which are for parents, are not, save the age level names (age-level.feature)

    Examples:
      | language | game             |
      | English  | the compare quiz |
      | Russian  | the compare quiz |
      | English  | the sorting game |
      | Russian  | the sorting game |
