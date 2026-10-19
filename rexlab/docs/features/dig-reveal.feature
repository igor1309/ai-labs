Feature: Dig: the reveal, its star and the level switch
  When the gust has blown, the dinosaur stays whole with its name: the
  reveal is the round's result. Each dinosaur dug up for the first
  time, at any level, earns its star once; the collection score is the
  number of dinosaurs dug up, out of all of them, with the best-score
  celebrations of the other games when it grows. The reveal shows the
  level switch above "DIG AGAIN", as the sorting game's result does
  (sort-dinosaurs-level-switch.feature).

  Background:
    Given an iPad in landscape

  Scenario: The reveal names the dinosaur
    Given I have dug up 4 dinosaurs, not Triceratops
    When the gust blows the last sand off Triceratops
    Then I see the whole Triceratops and its name "TRICERATOPS", large
    And a star flies to "DUG UP" and the count reads "5/42", with "NEW!"
    And with reduced motion the star and the count appear with a short fade
    And I see the level switch above "DIG AGAIN" with a 🔄 symbol, and "HOME" with a 🏠 symbol

  Scenario: The first dinosaur dug up is the first best
    Given I have never dug up a dinosaur
    When I dig up Stegosaurus
    Then I see a first best score celebration and "1/42"

  Scenario: A new dinosaur is a new best
    Given I have dug up 4 dinosaurs
    When I dig up one more
    Then I see a new best score celebration and "5/42"

  Scenario: A dinosaur dug up again earns no new star
    Given I have dug up Triceratops before, among 5
    When I dig up Triceratops again, at any level
    Then I see its name and "5/42", with no "NEW!", no flying star and no celebration

  Scenario: "DIG AGAIN" starts a new round at the level chosen
    Given I am on the reveal of a Hatchling round
    When I choose Explorer on the level switch and tap "DIG AGAIN"
    Then an Explorer round starts
    And the next round started from the "DIG" tile plays Explorer too

  Scenario: Choosing a level does not leave the reveal
    Given I am on the reveal with "5/42"
    When I choose Paleontologist on the level switch
    Then I still see the dinosaur and "5/42"
    And no round starts until I tap "DIG AGAIN"

  Scenario: The level switch reads as the other games' do
    When I see the reveal
    Then the switch shows HATCHLING, EXPLORER and PALEONTOLOGIST, youngest first, with 🥚, 🦖 and 🦴
    And the chosen level stands out from the other two by more than colour
    And each level is at least 48 by 48 CSS pixels to tap

  Scenario: Home from the reveal returns to the home page
    Given I am on the reveal
    When I tap "HOME"
    Then I am on the home page and the "DIG" tile shows my count

  Scenario Outline: The reveal fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I see a reveal of PACHYCEPHALOSAURUS with a new best on a 1024 by 768 screen
    Then the name, the count, the switch, "<again>" and "<home>" all show with no scrolling
    And the name shows whole on one line, as large as fits

    Examples:
      | language | theme | again      | home  |
      | English  | light | DIG AGAIN  | HOME  |
      | English  | dark  | DIG AGAIN  | HOME  |
      | Russian  | light | КОПАТЬ ЕЩЁ | ДОМОЙ |
      | Russian  | dark  | КОПАТЬ ЕЩЁ | ДОМОЙ |
