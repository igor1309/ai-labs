Feature: Picture puzzle full flow
  Scenario: A child completes and replays a picture puzzle
    Given I open the app in either Russian or English and either theme
    When I open PICTURE PUZZLE, choose a level and a dinosaur
    And I fit every piece using drag or tap then place
    Then I see a completed dinosaur and its reward
    When I choose another picture
    Then I return to picture choice with the completed dinosaur starred
    When I go home
    Then the puzzle home entry shows its collection progress
    And other games keep their existing behavior

  Scenario: Child-friendly feedback follows shared interaction rules
    Given I visit picture choice, puzzle and result
    Then child-facing words are capitalized and every action has a symbol
    And dinosaur names are large
    And screen changes, placement, retry, preview and rewards animate with shared motion tokens
    And reduced motion uses brief fades
    And picture loading uses the shared picture-loading behavior
    And rapid double taps cannot start two puzzles or skip a result
    And no puzzle-specific double-tap filter is introduced
