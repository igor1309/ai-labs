Feature: Dig: the reveal and its star
  When the gust has blown, the dinosaur stays whole with its name: the
  reveal is the round's result. Beside it is the "DUG UP" card: a ⭐,
  the words "DUG UP" and the count of dinosaurs dug up, out of all of
  them, such as "5/42". Each dinosaur dug up for the first time, at any
  level, earns its star once, with the best-score celebrations of the
  other games when the count grows. The 🦴 badge
  (dig-question.feature) shows on the same card. Under them stand
  the level switch (dig-level-switch.feature), "DIG AGAIN" with a 🔄
  symbol and "HOME" with a 🏠 symbol.

  Background:
    Given an iPad in landscape

  Scenario: The reveal names the dinosaur
    Given I have dug up 4 dinosaurs, not Triceratops
    When the gust blows the last sand off Triceratops
    Then I see the whole Triceratops and its name "TRICERATOPS", large
    And a star flies onto the "DUG UP" card, its count turns to "5/42", and "NEW!" shows on it
    And with reduced motion the star and the count appear with a short fade
    And I see the level switch above "DIG AGAIN" and "HOME"

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
    Then I see its name and "5/42" on the "DUG UP" card, with no "NEW!", no flying star and no celebration

  Scenario: The last dinosaur completes the collection
    Given I have dug up 41 of the 42 dinosaurs
    When I dig up the last one
    Then I see the new best score celebration, "42/42" and a 🏆 on the "DUG UP" card
    And every later reveal shows "42/42" with the 🏆

  Scenario: The reveal takes taps once its star has landed
    Given I am dabbing the sand as the gust blows
    When I tap where "DIG AGAIN" or the level switch shows, before the star has landed on the "DUG UP" card
    Then nothing happens, and once the star has landed the next tap works

  Scenario: Home from the reveal returns to the home page
    Given I am on the reveal
    When I tap "HOME"
    Then I am on the home page and the "DIG" tile shows my count

  Scenario Outline: The reveal fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I see the reveal of PACHYCEPHALOSAURUS, the 42nd dug up, named at the first pick, on a 1024 by 768 screen
    Then the name, the "<dug>" card with its count, "<new>", the 🏆 and the 🦴 badge, the switch, "<again>" and "<home>" all show with no scrolling
    And the name shows whole on one line, as large as fits
    And every word keeps at least 4.5:1 contrast with its background

    Examples:
      | language | theme | dug      | new    | again      | home  |
      | English  | light | DUG UP   | NEW!   | DIG AGAIN  | HOME  |
      | English  | dark  | DUG UP   | NEW!   | DIG AGAIN  | HOME  |
      | Russian  | light | ОТКОПАНО | НОВЫЙ! | КОПАТЬ ЕЩЁ | ДОМОЙ |
      | Russian  | dark  | ОТКОПАНО | НОВЫЙ! | КОПАТЬ ЕЩЁ | ДОМОЙ |
