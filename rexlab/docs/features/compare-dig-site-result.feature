Feature: COMPARE results in the dig site
  Rewards and level choices remain independent of appearance.
  A first round scoring zero saves a best of zero without earning a
  celebration. Every layout keeps a dinosaur at least 120 pixels high.
  Layout follows the window, independently of the device's identity:
    | class       | window                                                   |
    | wide        | landscape, at least 600 CSS pixels tall                   |
    | wide-short  | landscape, under 600 tall and at least 568 wide            |
    | tall        | portrait including square, at least 600 CSS pixels wide   |
    | tall-narrow | portrait under 600 wide, or landscape under 568 wide       |

  Scenario Outline: A result shows only available progress and earned celebrations
    Given a finished round scoring <score> out of 10 with a previous best of <previous>
    When its result is shown
    Then the score and ten stars show how many answers were correct
    And WELL DONE! is shown, or МОЛОДЕЦ! in Russian
    And the best-score display is <best>
    And the celebration is <celebration>
    And PLAY AGAIN and HOME remain available

    Examples:
      | score | previous    | best                           | celebration                    |
      | 4     | none        | trophy and 4                   | FIRST BEST! / ПЕРВЫЙ РЕКОРД!    |
      | 7     | 6           | trophy and 7 with the beaten 6  | NEW BEST! / НОВЫЙ РЕКОРД!       |
      | 5     | 7           | trophy and 7                   | absent                         |
      | 7     | 7           | trophy and 7                   | absent                         |
      | 4     | unavailable | absent, with no trophy          | absent                         |
      | 0     | none        | trophy and 0                   | absent                         |

  Scenario Outline: Result layout follows the window
    Given a completed result in a <width> by <height> CSS-pixel window of class <class>
    When its result is shown
    Then the dinosaur is <placement>
    And the score, ten stars, title, available best and earned celebration stand in the sand
    And the level switch stands above PLAY AGAIN and HOME
    And the actions are <actions>
    And the level switch shows <levels>

    Examples:
      | class       | width | height | placement                | actions      | levels                                |
      | wide        | 1180  | 820    | in the sky above rewards | side by side | pictures with visible names           |
      | tall        | 744   | 1133   | in the sky above rewards | side by side | pictures with visible names           |
      | tall-narrow | 393   | 852    | in the sky above rewards | stacked      | pictures only, names kept accessible  |
      | wide-short  | 852   | 393    | beside the rewards       | side by side | pictures only, names kept accessible  |
      | tall-narrow | 567   | 360    | in the sky above rewards | stacked      | pictures only, names kept accessible  |
      | wide-short  | 568   | 360    | beside the rewards       | side by side | pictures only, names kept accessible  |
      | tall        | 700   | 700    | in the sky above rewards | side by side | pictures with visible names           |
      | tall-narrow | 500   | 500    | in the sky above rewards | stacked      | pictures only, names kept accessible  |

  Scenario Outline: A result scrolls when its minimum content cannot fit
    Given a completed result in a <class> window
    And the dinosaur would be less than 120 CSS pixels high or the rewards and controls would overflow the height
    When its result is shown
    Then the dinosaur remains at least 120 CSS pixels high
    And the whole screen, sky included, scrolls vertically
    And there is no nested rewards scroll

    Examples:
      | class       |
      | wide        |
      | tall        |
      | tall-narrow |
      | wide-short  |

  Scenario: Choosing a level leaves the finished round's reward intact
    Given an Explorer result showing 7 out of 10
    When I choose Hatchling
    Then the score and Explorer best remain unchanged
    And no round starts until PLAY AGAIN
    And PLAY AGAIN starts Hatchling

  Scenario: Turning preserves the round without replaying a celebration
    Given an answered question or a completed result
    And reduced motion is off
    When the window changes shape
    Then the current question, marks, values, score and chosen level remain
    And the layout changes with the shared turn motion
    And a completed celebration does not replay

  Scenario: Changing appearance preserves the round
    Given an answered question or a completed result
    When the appearance changes between light and dark
    Then the current question, marks, values, score and chosen level remain
    And the new appearance's design tokens colour the same state
    And a completed celebration does not replay

  Scenario: Reduced motion replaces movement with short fades
    Given reduced motion is on
    When I answer, advance, see a result, choose a level or turn the window
    Then each transition uses the shared short fade instead of movement
    And the same game state and interactions remain available
